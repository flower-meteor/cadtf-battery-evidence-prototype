"""Streamlit entry point for the CADTF prototype."""

from __future__ import annotations

import streamlit as st

from cadtf import CADTFService
from cadtf.ui import render_app


st.set_page_config(
    page_title="CADTF Battery Evidence Prototype",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_resource
def get_service() -> CADTFService:
    return CADTFService()


render_app(get_service())
