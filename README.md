# CADTF 可运行原型

本目录是一套基于 D 盘独立 Python 环境的 CADTF 电池健康证据链原型。它把电池装机、构型、软件、校准、测量、健康估计、验证边界、证据包和人工审查连接起来。

原型使用合成数据，不包含个人隐私、真实飞机运行数据或真实电池试验结果，也不能用于适航批准、维修放行或飞行决策。

## 快速开始

双击 `start_app.cmd` 启动网页界面。浏览器默认打开：

`http://localhost:8501`

双击 `check_environment.cmd` 检查运行环境。

双击 `run_validation.cmd` 运行完整测试、证据校验、导出和验证报告生成。

启动后不要关闭命令行窗口；该窗口就是本地服务。若浏览器没有自动弹出，
手动访问 `http://127.0.0.1:8501`。

## 已实现功能

- 飞机、电池包、模型版本和装机记录；
- 构型与软件变更后的模型适用性检查；
- 手工录入测量数据和 CSV 批量导入；
- 容量、内阻、温度、倍率、循环次数和来源校验；
- 可解释的 SOH、容量健康、内阻健康、可用功率和不确定度估计；
- `valid`、`review_required`、`blocked` 三态验证；
- 每项估计自动生成 SHA-256 证据包；
- 阻断或待审查结果的人工处置记录；
- 合成试点评价数据及可交互对比；
- 双语证据字典；
- Excel、JSON、CSV 和 SQLite 数据导出。

## 演示流程

1. 打开 Overview，查看系统指标和待审查队列。
2. 在 Fleet & Configuration 修改一个电池包构型，检查兼容性并提交变更。
3. 在 Measurement & Estimate 运行估计，观察高应力电池包被阻断。
4. 在 Evidence & Review 查看证据链、哈希校验和开放问题。
5. 对有效结果记录 `accepted`，对阻断结果只能选择拒收、补数据或升级审查。
6. 在 Pilot Evaluation 查看合成对照实验结果。
7. 在 Dictionary & Export 导出证据字典、Excel 和 SQLite 数据库。

## 演示数据

- `BAT-001`：正常 NMC 电池包，预期为 `valid`。
- `BAT-002`：高温、高倍率和高循环电池包，预期为 `blocked`。
- `BAT-003`：LFP 电池包，使用独立模型域，预期为 `valid`。

## 命令行

```powershell
.\.venv\Scripts\python.exe scripts\run_demo.py --reset
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe scripts\validate_evidence.py
.\.venv\Scripts\python.exe scripts\export_demo.py
.\.venv\Scripts\python.exe scripts\generate_validation_report.py
```

## 目录

- `app.py`：Streamlit 入口。
- `cadtf\`：数据库、领域模型、健康估计、证据包、服务和界面。
- `tests\`：13 项自动化测试。
- `scripts\`：演示、导出、证据校验和验证报告脚本。
- `data\cadtf_demo.db`：SQLite 演示数据库。
- `exports\`：Excel、证据 JSON 和验证清单。
- `docs\PROTOTYPE_DESIGN.md`：原型设计说明。
- `docs\VALIDATION_REPORT.md`：自动生成的当前验证报告。
- `项目完成说明.md`：中文完成说明和演示步骤。
- `DELIVERABLE_MANIFEST.csv`：全部交付文件的大小与 SHA-256 清单。

## 环境

- Python 3.12.8
- SQLite 3.45.3
- Streamlit 1.63.0
- pandas、NumPy、SciPy、scikit-learn、Plotly
- pydantic、SQLAlchemy、openpyxl、pytest

完整依赖版本见 `requirements.txt`。

## 边界

本原型验证的是软件工作流、证据组织和验证逻辑。健康模型仍是可解释的演示基线，尚未使用代表性电池包数据完成工程验证。真实试点还需要数据授权、实验室测试、独立模型确认、身份权限、签署机制和安全评审。
