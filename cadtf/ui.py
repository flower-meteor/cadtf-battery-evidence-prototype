"""Streamlit user interface for the CADTF prototype."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from .models import ValidationResult
from .service import CADTFService


STATUS_LABELS = {
    "valid": "Releasable",
    "review_required": "Review required",
    "blocked": "Blocked",
}


def _inject_styles() -> None:
    st.markdown(
        """
        <style>
        .block-container {
            max-width: 1320px;
            padding-top: 1.7rem;
            padding-bottom: 3rem;
        }
        div[data-testid="stMetric"] {
            border: 1px solid #d9e2e8;
            border-radius: 6px;
            padding: 0.7rem 0.85rem;
            background: #ffffff;
        }
        div[data-testid="stMetricLabel"] {
            color: #52636d;
        }
        .cadtf-note {
            border-left: 4px solid #2a6f97;
            background: #eef5f8;
            padding: 0.65rem 0.8rem;
            border-radius: 4px;
            color: #253942;
            margin: 0.4rem 0 0.9rem 0;
        }
        .cadtf-status {
            display: inline-block;
            padding: 0.16rem 0.48rem;
            border-radius: 4px;
            font-size: 0.82rem;
            font-weight: 600;
        }
        .cadtf-status-valid {
            background: #dff2e7;
            color: #1e6440;
        }
        .cadtf-status-review {
            background: #fff1c7;
            color: #7a5500;
        }
        .cadtf-status-blocked {
            background: #f9dddd;
            color: #8b2525;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _status_markdown(status: str) -> str:
    css_class = {
        "valid": "cadtf-status-valid",
        "review_required": "cadtf-status-review",
        "blocked": "cadtf-status-blocked",
    }.get(status, "cadtf-status-review")
    return (
        f'<span class="cadtf-status {css_class}">'
        f"{STATUS_LABELS.get(status, status)}</span>"
    )


def _show_status(status: str) -> None:
    if status == "valid":
        st.success("Releasable within the current validation domain.")
    elif status == "review_required":
        st.warning("Review required before the estimate can support a disposition.")
    else:
        st.error("Advisory suppressed because the model-domain check is blocked.")


def _validation_table(validation: ValidationResult) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "check": code,
                "result": result.upper(),
            }
            for code, result in validation.checks.items()
        ]
    )


def _estimate_status_chart(estimate: dict[str, Any]) -> go.Figure:
    labels = ["State of health", "Capacity", "Resistance", "Usable power"]
    values = [
        estimate["soh_pct"],
        estimate["capacity_health_pct"],
        estimate["resistance_health_pct"],
        estimate["usable_power_pct"],
    ]
    colors = ["#2a6f97", "#3f8f6b", "#d29b2d", "#7b6da8"]
    figure = go.Figure(
        go.Bar(
            x=values,
            y=labels,
            orientation="h",
            marker_color=colors,
            text=[f"{value:.1f}%" for value in values],
            textposition="outside",
            hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
        )
    )
    figure.update_layout(
        height=300,
        margin=dict(l=20, r=40, t=20, b=20),
        xaxis=dict(range=[0, 110], title="Percent"),
        yaxis=dict(autorange="reversed"),
        showlegend=False,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return figure


def _render_overview(service: CADTFService) -> None:
    metrics = service.dashboard_metrics()
    st.subheader("System overview")
    st.markdown(
        """
        <div class="cadtf-note">
        Synthetic engineering prototype. Measurements and pilot metrics are
        generated for workflow demonstration and are not aircraft operating data.
        </div>
        """,
        unsafe_allow_html=True,
    )

    columns = st.columns(5)
    columns[0].metric("Aircraft", metrics["aircraft_count"])
    columns[1].metric("Battery packs", metrics["pack_count"])
    columns[2].metric("Estimates", metrics["estimate_count"])
    columns[3].metric("Pending reviews", metrics["pending_review_count"])
    columns[4].metric(
        "Mean evidence completeness",
        f"{metrics['mean_evidence_score_pct']:.1f}%",
    )

    left, right = st.columns([1.55, 1.0], gap="large")
    with left:
        st.markdown("#### Latest estimates")
        estimates = service.list_estimates(limit=12)
        if estimates:
            frame = pd.DataFrame(estimates)[
                [
                    "pack_id",
                    "soh_pct",
                    "uncertainty_pct",
                    "validation_status",
                    "evidence_score_pct",
                    "created_at",
                ]
            ].rename(
                columns={
                    "pack_id": "Pack",
                    "soh_pct": "SOH (%)",
                    "uncertainty_pct": "Uncertainty (%)",
                    "validation_status": "Validation",
                    "evidence_score_pct": "Evidence (%)",
                    "created_at": "Created",
                }
            )
            st.dataframe(frame, width="stretch", hide_index=True)
        else:
            st.info("No estimates are available.")

    with right:
        st.markdown("#### Review queue")
        pending = service.pending_reviews()
        if pending:
            st.dataframe(
                pd.DataFrame(pending)[
                    [
                        "estimate_id",
                        "pack_id",
                        "validation_status",
                        "soh_pct",
                    ]
                ],
                width="stretch",
                hide_index=True,
            )
        else:
            st.success("No review-required or blocked estimates are open.")

    with st.expander("Recent evidence events", expanded=False):
        events = service.recent_events(limit=25)
        if events:
            event_frame = pd.DataFrame(events)[
                ["created_at", "event_type", "entity_id", "details"]
            ].copy()
            event_frame["details"] = event_frame["details"].map(
                lambda value: json.dumps(value, ensure_ascii=False)
            )
            st.dataframe(event_frame, width="stretch", hide_index=True)
        else:
            st.caption("No events recorded.")


def _render_fleet(service: CADTFService) -> None:
    st.subheader("Fleet and configuration")
    packs = service.list_packs()
    if not packs:
        st.warning("No battery packs are registered.")
        return
    pack_id = st.selectbox(
        "Battery pack",
        [pack["pack_id"] for pack in packs],
        key="fleet_pack",
    )
    pack = next(item for item in packs if item["pack_id"] == pack_id)
    model = service.get_model_for_pack(pack_id)

    left, right = st.columns([1.15, 1.0], gap="large")
    with left:
        st.markdown("#### Current asset record")
        asset = pd.DataFrame(
            [
                {
                    "field": "Pack",
                    "value": pack["pack_id"],
                },
                {
                    "field": "Manufacturer",
                    "value": pack["manufacturer"],
                },
                {
                    "field": "Chemistry",
                    "value": pack["chemistry"],
                },
                {
                    "field": "Rated capacity (Ah)",
                    "value": f"{pack['rated_capacity_ah']:.2f}",
                },
                {
                    "field": "Aircraft",
                    "value": pack["aircraft_id"] or "Unassigned",
                },
                {
                    "field": "Configuration",
                    "value": pack["configuration_revision"] or "Unassigned",
                },
                {
                    "field": "Software",
                    "value": pack["software_version"] or "Unassigned",
                },
                {
                    "field": "Calibration",
                    "value": (
                        "Valid"
                        if pack["calibration_valid"] == 1
                        else "Invalid"
                    ),
                },
            ]
        )
        st.dataframe(asset, width="stretch", hide_index=True)

        if model is not None:
            st.markdown("#### Selected model domain")
            domain = pd.DataFrame(
                [
                    {"item": "Model", "value": model.model_id},
                    {"item": "Algorithm", "value": model.algorithm},
                    {
                        "item": "Temperature",
                        "value": (
                            f"{model.temp_min_c:.1f} to "
                            f"{model.temp_max_c:.1f} C"
                        ),
                    },
                    {
                        "item": "Charge limit",
                        "value": f"{model.max_charge_c_rate:.2f} C",
                    },
                    {
                        "item": "Discharge limit",
                        "value": f"{model.max_discharge_c_rate:.2f} C",
                    },
                    {
                        "item": "Cycle limit",
                        "value": f"{model.max_cycles}",
                    },
                    {
                        "item": "Allowed configurations",
                        "value": ", ".join(model.allowed_config_revisions),
                    },
                ]
            )
            st.dataframe(domain, width="stretch", hide_index=True)

    with right:
        st.markdown("#### Installation change scenario")
        st.caption(
            "A configuration or software change creates a review finding when "
            "it has not been included in the model validation evidence."
        )
        aircraft_ids = [
            item["aircraft_id"] for item in service.list_aircraft()
        ]
        aircraft_id = st.selectbox(
            "Aircraft",
            aircraft_ids,
            index=(
                aircraft_ids.index(pack["aircraft_id"])
                if pack["aircraft_id"] in aircraft_ids
                else 0
            ),
            key="fleet_aircraft",
        )
        configuration = st.text_input(
            "Configuration revision",
            value=pack["configuration_revision"] or "CONF-A",
            key="fleet_configuration",
        )
        software = st.text_input(
            "Software version",
            value=pack["software_version"] or "2.1.0",
            key="fleet_software",
        )
        calibration_valid = st.checkbox(
            "Sensor calibration valid",
            value=bool(pack["calibration_valid"]),
            key="fleet_calibration",
        )
        calibration_date = st.date_input(
            "Calibration date",
            value=date.today(),
            key="fleet_calibration_date",
        )

        preview = None
        if st.button(
            "Check compatibility",
            width="stretch",
            key="preview_installation",
        ):
            preview = service.preview_installation(
                pack_id,
                configuration,
                software,
                calibration_valid,
            )
            st.session_state["installation_preview"] = {
                "pack_id": pack_id,
                "configuration": configuration,
                "software": software,
                "calibration_valid": calibration_valid,
                "status": preview["validation"].status,
                "issues": [
                    issue.model_dump(mode="json")
                    for issue in preview["validation"].issues
                ],
            }

        saved_preview = st.session_state.get("installation_preview")
        if (
            saved_preview
            and saved_preview["pack_id"] == pack_id
            and saved_preview["configuration"] == configuration
            and saved_preview["software"] == software
        ):
            st.markdown(
                _status_markdown(saved_preview["status"]),
                unsafe_allow_html=True,
            )
            for issue in saved_preview["issues"]:
                st.write(f"- {issue['message']}")

        confirmed = st.checkbox(
            "I confirm this configuration change for the demo database.",
            key="commit_installation_confirmation",
        )
        if st.button(
            "Commit installation change",
            type="primary",
            width="stretch",
            disabled=not confirmed,
            key="commit_installation",
        ):
            service.change_installation(
                aircraft_id=aircraft_id,
                pack_id=pack_id,
                configuration_revision=configuration,
                software_version=software,
                calibration_valid=calibration_valid,
                calibration_date=calibration_date.isoformat(),
                notes="Recorded from the prototype configuration workflow",
            )
            st.session_state.pop("installation_preview", None)
            st.success("Installation record updated.")
            st.rerun()


def _render_data_and_estimate(service: CADTFService) -> None:
    st.subheader("Measurement and health estimate")
    packs = service.list_packs()
    if not packs:
        st.warning("No battery packs are registered.")
        return
    pack_id = st.selectbox(
        "Battery pack",
        [pack["pack_id"] for pack in packs],
        key="measurement_pack",
    )
    latest = service.latest_measurement(pack_id)
    if latest is not None:
        left, right = st.columns([1.35, 1.0], gap="large")
        with left:
            st.markdown("#### Latest measurement")
            frame = pd.DataFrame(
                [
                    {"field": "Batch", "value": latest["batch_id"]},
                    {"field": "Measured", "value": latest["measured_at"]},
                    {
                        "field": "Capacity (Ah)",
                        "value": f"{latest['capacity_ah']:.3f}",
                    },
                    {
                        "field": "Resistance (mOhm)",
                        "value": f"{latest['resistance_mohm']:.3f}",
                    },
                    {
                        "field": "Temperature (C)",
                        "value": (
                            f"{latest['min_temp_c']:.1f} to "
                            f"{latest['max_temp_c']:.1f}"
                        ),
                    },
                    {
                        "field": "Charge rate (C)",
                        "value": f"{latest['charge_c_rate']:.2f}",
                    },
                    {
                        "field": "Discharge rate (C)",
                        "value": f"{latest['discharge_c_rate']:.2f}",
                    },
                    {
                        "field": "Cycles",
                        "value": f"{latest['cycles']}",
                    },
                    {
                        "field": "Source hash",
                        "value": latest["source_hash"][:20] + "...",
                    },
                ]
            )
            st.dataframe(frame, width="stretch", hide_index=True)
        with right:
            st.markdown("#### Measurement record")
            st.caption(latest["provenance"])
            if latest["notes"]:
                st.caption(latest["notes"])

    with st.expander("Add or import measurement data", expanded=False):
        manual_tab, csv_tab = st.tabs(["Manual entry", "CSV batch import"])
        with manual_tab:
            with st.form("measurement_form"):
                first, second, third = st.columns(3)
                batch_id = first.text_input("Batch ID", value="LAB-NEW")
                measured_date = second.date_input(
                    "Measurement date", value=date.today()
                )
                cycles = third.number_input(
                    "Cycles", min_value=0, value=450, step=1
                )
                capacity = first.number_input(
                    "Capacity (Ah)",
                    min_value=0.1,
                    value=18.0,
                    step=0.1,
                    format="%.3f",
                )
                resistance = second.number_input(
                    "Resistance (mOhm)",
                    min_value=0.1,
                    value=22.0,
                    step=0.1,
                    format="%.3f",
                )
                charge_rate = third.number_input(
                    "Charge rate (C)",
                    min_value=0.0,
                    value=0.8,
                    step=0.05,
                    format="%.2f",
                )
                min_temperature = first.number_input(
                    "Minimum temperature (C)",
                    value=-5.0,
                    step=1.0,
                    format="%.1f",
                )
                max_temperature = second.number_input(
                    "Maximum temperature (C)",
                    value=38.0,
                    step=1.0,
                    format="%.1f",
                )
                discharge_rate = third.number_input(
                    "Discharge rate (C)",
                    min_value=0.0,
                    value=1.45,
                    step=0.05,
                    format="%.2f",
                )
                provenance = st.text_input(
                    "Provenance",
                    value="Synthetic measurement entered in the prototype",
                )
                notes = st.text_input("Notes", value="")
                add_and_run = st.form_submit_button(
                    "Save measurement and run estimate",
                    type="primary",
                    width="stretch",
                )
                if add_and_run:
                    measurement_id = service.add_measurement(
                        {
                            "pack_id": pack_id,
                            "batch_id": batch_id,
                            "capacity_ah": capacity,
                            "resistance_mohm": resistance,
                            "min_temp_c": min_temperature,
                            "max_temp_c": max_temperature,
                            "charge_c_rate": charge_rate,
                            "discharge_c_rate": discharge_rate,
                            "cycles": int(cycles),
                            "provenance": provenance,
                            "notes": notes,
                        },
                        measured_at=datetime.combine(
                            measured_date,
                            datetime.min.time(),
                            tzinfo=timezone.utc,
                        ),
                    )
                    result = service.run_estimate(pack_id, measurement_id)
                    st.session_state["selected_estimate_id"] = result[
                        "estimate_id"
                    ]
                    st.success("Measurement saved and estimate created.")
                    st.rerun()

        with csv_tab:
            required_columns = [
                "pack_id",
                "batch_id",
                "measured_at",
                "capacity_ah",
                "resistance_mohm",
                "min_temp_c",
                "max_temp_c",
                "charge_c_rate",
                "discharge_c_rate",
                "cycles",
                "provenance",
                "notes",
            ]
            template = pd.DataFrame(
                [
                    {
                        "pack_id": "BAT-001",
                        "batch_id": "LAB-CSV-001",
                        "measured_at": "2026-09-16T00:00:00+00:00",
                        "capacity_ah": 18.6,
                        "resistance_mohm": 21.4,
                        "min_temp_c": -5.0,
                        "max_temp_c": 38.0,
                        "charge_c_rate": 0.8,
                        "discharge_c_rate": 1.4,
                        "cycles": 420,
                        "provenance": "Synthetic CSV import",
                        "notes": "Prototype example",
                    }
                ]
            )
            st.download_button(
                "Download CSV template",
                data=template.to_csv(index=False).encode("utf-8-sig"),
                file_name="cadtf_measurement_template.csv",
                mime="text/csv",
                width="stretch",
            )
            uploaded = st.file_uploader(
                "Measurement CSV",
                type=["csv"],
                key="measurement_csv",
            )
            if uploaded is not None:
                try:
                    imported_frame = pd.read_csv(uploaded)
                except Exception as exc:
                    st.error(f"CSV could not be read: {exc}")
                else:
                    missing_columns = [
                        column
                        for column in required_columns
                        if column not in imported_frame.columns
                    ]
                    if missing_columns:
                        st.error(
                            "Missing columns: " + ", ".join(missing_columns)
                        )
                    else:
                        st.dataframe(
                            imported_frame,
                            width="stretch",
                            hide_index=True,
                        )
                        st.caption(
                            f"{len(imported_frame)} rows detected. Import will "
                            "validate every row and create an estimate for each "
                            "valid record."
                        )
                        if st.button(
                            "Validate and import CSV",
                            type="primary",
                            width="stretch",
                            key="import_measurement_csv",
                        ):
                            result = service.import_measurements(
                                imported_frame.to_dict(orient="records"),
                                run_estimates=True,
                            )
                            if result["errors"]:
                                st.error(
                                    f"{len(result['errors'])} rows failed "
                                    "validation."
                                )
                                st.dataframe(
                                    pd.DataFrame(result["errors"]),
                                    width="stretch",
                                    hide_index=True,
                                )
                            if result["imported_measurement_ids"]:
                                st.success(
                                    f"Imported "
                                    f"{len(result['imported_measurement_ids'])} "
                                    "measurements and created "
                                    f"{len(result['created_estimate_ids'])} "
                                    "estimates."
                                )
                                if result["created_estimate_ids"]:
                                    st.session_state["selected_estimate_id"] = (
                                        result["created_estimate_ids"][-1]
                                    )
                                if not result["errors"]:
                                    st.rerun()

    st.markdown("#### Analysis")
    action_left, action_right = st.columns([1.0, 2.0])
    with action_left:
        if st.button(
            "Run estimate on latest measurement",
            type="primary",
            width="stretch",
            key="run_latest_estimate",
        ):
            result = service.run_estimate(pack_id)
            st.session_state["selected_estimate_id"] = result["estimate_id"]
            st.rerun()
    with action_right:
        pack_estimates = service.list_estimates(pack_id=pack_id, limit=30)
        if pack_estimates:
            selected_id = st.selectbox(
                "Estimate record",
                [row["estimate_id"] for row in pack_estimates],
                format_func=lambda value: (
                    f"#{value} · "
                    f"{next(row for row in pack_estimates if row['estimate_id'] == value)['validation_status']} · "
                    f"{next(row for row in pack_estimates if row['estimate_id'] == value)['soh_pct']:.1f}%"
                ),
                key="select_estimate",
            )
        else:
            selected_id = None

    if selected_id is None:
        st.info("No estimate exists for the selected pack.")
        return

    detail = service.get_estimate(int(selected_id))
    if detail is None:
        st.error("The selected estimate could not be loaded.")
        return

    metric_columns = st.columns(5)
    metric_columns[0].metric("State of health", f"{detail['soh_pct']:.1f}%")
    metric_columns[1].metric(
        "Uncertainty", f"±{detail['uncertainty_pct']:.1f}%"
    )
    metric_columns[2].metric(
        "Usable power", f"{detail['usable_power_pct']:.1f}%"
    )
    metric_columns[3].metric(
        "Remaining cycles",
        f"{detail['indicative_remaining_cycles']}",
    )
    metric_columns[4].metric(
        "Evidence completeness",
        f"{detail['evidence_score_pct']:.1f}%",
    )
    st.markdown(
        _status_markdown(detail["validation_status"]),
        unsafe_allow_html=True,
    )
    _show_status(detail["validation_status"])

    chart_left, chart_right = st.columns([1.0, 1.25], gap="large")
    with chart_left:
        st.plotly_chart(
            _estimate_status_chart(detail),
            width="stretch",
            config={"displayModeBar": False},
        )
    with chart_right:
        validation = ValidationResult.model_validate(
            detail["evidence_package"]["validation_record"]
        )
        st.markdown("#### Validation checks")
        st.dataframe(
            _validation_table(validation),
            width="stretch",
            hide_index=True,
        )

    st.markdown("#### Advisory")
    if detail["validation_status"] == "valid":
        st.info(detail["advisory"])
    else:
        st.warning(detail["advisory"])

    if validation.issues:
        st.markdown("#### Open findings")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "code": issue.code,
                        "severity": issue.severity,
                        "message": issue.message,
                    }
                    for issue in validation.issues
                ]
            ),
            width="stretch",
            hide_index=True,
        )


def _render_evidence_and_review(service: CADTFService) -> None:
    st.subheader("Evidence chain and authorised review")
    estimates = service.list_estimates(limit=100)
    if not estimates:
        st.info("No estimate records exist.")
        return

    estimate_id = st.selectbox(
        "Estimate",
        [row["estimate_id"] for row in estimates],
        format_func=lambda value: (
            f"#{value} · "
            f"{next(row for row in estimates if row['estimate_id'] == value)['pack_id']} · "
            f"{next(row for row in estimates if row['estimate_id'] == value)['validation_status']}"
        ),
        key="evidence_estimate",
    )
    detail = service.get_estimate(int(estimate_id))
    if detail is None:
        st.error("The selected estimate could not be loaded.")
        return
    package = detail["evidence_package"]

    columns = st.columns(4)
    columns[0].metric("Evidence score", f"{detail['evidence_score_pct']:.1f}%")
    columns[1].metric(
        "Package integrity",
        "Verified" if detail["evidence_verified"] else "Failed",
    )
    columns[2].metric("Validation", STATUS_LABELS[detail["validation_status"]])
    columns[3].metric(
        "Review",
        (
            detail["latest_review"]["disposition"]
            if detail["latest_review"]
            else "Pending"
            if detail["validation_status"] != "valid"
            else "Optional"
        ),
    )

    st.markdown(
        _status_markdown(detail["validation_status"]),
        unsafe_allow_html=True,
    )
    st.code(package["package_id"], language=None)

    hash_left, hash_right = st.columns(2)
    hash_left.text_input(
        "Evidence package hash",
        value=package["package_hash"],
        disabled=True,
    )
    hash_right.text_input(
        "Source data hash",
        value=package["input_record"]["source_hash"],
        disabled=True,
    )

    link_frame = pd.DataFrame(
        [
            {
                "link": "Physical asset",
                "value": f"{package['physical_asset']['pack_id']} on {package['physical_asset']['aircraft_id']}",
            },
            {
                "link": "Configuration",
                "value": package["physical_asset"]["configuration_revision"],
            },
            {
                "link": "Software",
                "value": package["physical_asset"]["software_version"],
            },
            {
                "link": "Input record",
                "value": f"Measurement {package['input_record']['measurement_id']}",
            },
            {
                "link": "Model",
                "value": package["model_record"]["model_id"],
            },
            {
                "link": "Validation",
                "value": STATUS_LABELS[
                    package["validation_record"]["status"]
                ],
            },
            {
                "link": "Estimate",
                "value": f"SOH {package['estimate_record']['soh_pct']:.1f}%",
            },
            {
                "link": "Authorised review",
                "value": (
                    detail["latest_review"]["disposition"]
                    if detail["latest_review"]
                    else "Not recorded"
                ),
            },
        ]
    )
    st.dataframe(link_frame, width="stretch", hide_index=True)

    download_col, json_col = st.columns([1.0, 1.0])
    with download_col:
        st.download_button(
            "Download evidence package",
            data=json.dumps(package, ensure_ascii=False, indent=2).encode(
                "utf-8"
            ),
            file_name=f"{package['package_id']}.json",
            mime="application/json",
            width="stretch",
        )
    with json_col:
        with st.popover("Inspect evidence JSON"):
            st.json(package)

    st.divider()
    st.markdown("#### Record review disposition")
    if detail["validation_status"] == "valid":
        dispositions = ["accepted", "rejected", "needs_data", "escalated"]
    else:
        dispositions = ["rejected", "needs_data", "escalated"]
    with st.form("review_form"):
        first, second = st.columns(2)
        reviewer = first.text_input("Reviewer role or identifier")
        disposition = second.selectbox("Disposition", dispositions)
        rationale = st.text_area(
            "Rationale",
            placeholder=(
                "State the evidence considered, the decision and any "
                "conditions or follow-up action."
            ),
        )
        signature = st.text_input(
            "Authorisation or signature reference",
            help="Use a project reference, not a personal credential.",
        )
        submitted = st.form_submit_button(
            "Record review",
            type="primary",
            width="stretch",
        )
        if submitted:
            try:
                service.record_review(
                    int(estimate_id),
                    reviewer,
                    disposition,
                    rationale,
                    signature,
                )
            except ValueError as exc:
                st.error(str(exc))
            else:
                st.success("Review disposition recorded.")
                st.rerun()

    if detail["latest_review"]:
        review = detail["latest_review"]
        st.markdown("#### Latest review")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "reviewer": review["reviewer"],
                        "disposition": review["disposition"],
                        "rationale": review["rationale"],
                        "signature": review["signature"],
                        "created_at": review["created_at"],
                    }
                ]
            ),
            width="stretch",
            hide_index=True,
        )


def _pilot_chart(metrics: dict[str, Any]) -> go.Figure:
    methods = ["manual", "cadtf_synthetic"]
    labels = ["Manual baseline", "CADTF synthetic"]
    colors = ["#7a8790", "#2a6f97"]
    traceability = [
        metrics[method]["mean_traceability_pct"] for method in methods
    ]
    reconstruction = [
        metrics[method]["mean_reconstruction_minutes"] for method in methods
    ]
    model_error = [
        metrics[method]["mean_model_error_pct"] for method in methods
    ]

    from plotly.subplots import make_subplots

    figure = make_subplots(
        rows=1,
        cols=3,
        subplot_titles=(
            "Traceability (%)",
            "Reconstruction time (min)",
            "Model error (%)",
        ),
        horizontal_spacing=0.12,
    )
    for index, color in enumerate(colors):
        figure.add_trace(
            go.Bar(
                x=[labels[index]],
                y=[traceability[index]],
                marker_color=color,
                showlegend=False,
            ),
            row=1,
            col=1,
        )
        figure.add_trace(
            go.Bar(
                x=[labels[index]],
                y=[reconstruction[index]],
                marker_color=color,
                showlegend=False,
            ),
            row=1,
            col=2,
        )
        figure.add_trace(
            go.Bar(
                x=[labels[index]],
                y=[model_error[index]],
                marker_color=color,
                showlegend=False,
            ),
            row=1,
            col=3,
        )
    figure.update_layout(
        height=360,
        margin=dict(l=20, r=20, t=55, b=20),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return figure


def _render_pilot(service: CADTFService) -> None:
    st.subheader("Pilot evaluation harness")
    st.markdown(
        """
        <div class="cadtf-note">
        The current figures are deterministic synthetic evaluation data. They
        exercise the evaluation workflow and are not achieved pilot performance.
        </div>
        """,
        unsafe_allow_html=True,
    )
    metrics = service.pilot_metrics()
    manual = metrics["manual"]
    cadtf = metrics["cadtf_synthetic"]
    if not manual or not cadtf:
        st.info("Synthetic pilot data is not available.")
        return

    columns = st.columns(4)
    columns[0].metric(
        "Traceability improvement",
        f"{cadtf['mean_traceability_pct'] - manual['mean_traceability_pct']:+.1f} pp",
    )
    columns[1].metric(
        "Reconstruction time reduction",
        f"{manual['mean_reconstruction_minutes'] - cadtf['mean_reconstruction_minutes']:.1f} min",
    )
    columns[2].metric(
        "Alerts per case",
        f"{cadtf['mean_alerts']:.1f}",
    )
    columns[3].metric(
        "Mean model error",
        f"{cadtf['mean_model_error_pct']:.1f}%",
    )
    st.plotly_chart(
        _pilot_chart(metrics),
        width="stretch",
        config={"displayModeBar": False},
    )

    frame = service.db.dataframe(
        """
        SELECT case_id, method, traceability_pct, reconstruction_minutes,
               model_error_pct, alert_count, cost_units
        FROM pilot_runs
        ORDER BY case_id, method
        """
    )
    st.dataframe(frame, width="stretch", hide_index=True)


def _render_dictionary_and_export(service: CADTFService) -> None:
    st.subheader("Evidence dictionary and export")
    dictionary = pd.DataFrame(service.evidence_dictionary())
    st.dataframe(dictionary, width="stretch", hide_index=True)

    dictionary_json = dictionary.to_json(
        orient="records", force_ascii=False, indent=2
    ).encode("utf-8")
    dictionary_csv = dictionary.to_csv(index=False).encode("utf-8-sig")
    left, right = st.columns(2)
    left.download_button(
        "Download dictionary JSON",
        data=dictionary_json,
        file_name="cadtf_evidence_dictionary.json",
        mime="application/json",
        width="stretch",
    )
    right.download_button(
        "Download dictionary CSV",
        data=dictionary_csv,
        file_name="cadtf_evidence_dictionary.csv",
        mime="text/csv",
        width="stretch",
    )

    st.divider()
    st.markdown("#### Complete prototype export")
    output = io.BytesIO()
    tables = service.export_tables()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        summary = pd.DataFrame(
            [
                {"metric": key, "value": value}
                for key, value in service.dashboard_metrics().items()
            ]
        )
        summary.to_excel(writer, sheet_name="summary", index=False)
        for table_name, frame in tables.items():
            frame.to_excel(writer, sheet_name=table_name[:31], index=False)
    st.download_button(
        "Download complete Excel export",
        data=output.getvalue(),
        file_name="cadtf_prototype_export.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        width="stretch",
    )

    if service.db.path.exists():
        st.download_button(
            "Download SQLite database",
            data=service.db.path.read_bytes(),
            file_name="cadtf_demo.db",
            mime="application/vnd.sqlite3",
            width="stretch",
        )

    with st.expander("Reset synthetic demonstration data", expanded=False):
        st.caption(
            "This deletes and rebuilds only the prototype database in the "
            "project data directory."
        )
        confirmed = st.checkbox(
            "I understand that the local synthetic demo records will be rebuilt.",
            key="reset_demo_confirmation",
        )
        if st.button(
            "Reset demo data",
            disabled=not confirmed,
            type="primary",
            key="reset_demo",
        ):
            service.reset_demo()
            st.session_state.clear()
            st.success("Synthetic demonstration data rebuilt.")
            st.rerun()


def render_app(service: CADTFService) -> None:
    _inject_styles()
    service.ensure_demo_data(run_estimates=True)

    st.sidebar.title("CADTF")
    st.sidebar.caption("Battery evidence prototype")
    page = st.sidebar.radio(
        "Workspace",
        [
            "Overview",
            "Fleet & Configuration",
            "Measurement & Estimate",
            "Evidence & Review",
            "Pilot Evaluation",
            "Dictionary & Export",
        ],
        label_visibility="collapsed",
    )
    st.sidebar.caption(f"Database: {service.db.path.name}")
    st.sidebar.caption("Synthetic data only")

    if page == "Overview":
        _render_overview(service)
    elif page == "Fleet & Configuration":
        _render_fleet(service)
    elif page == "Measurement & Estimate":
        _render_data_and_estimate(service)
    elif page == "Evidence & Review":
        _render_evidence_and_review(service)
    elif page == "Pilot Evaluation":
        _render_pilot(service)
    else:
        _render_dictionary_and_export(service)
