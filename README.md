# NEXUS WAREHOUSE

交互式智能仓储演示：三维仓库、多车协同调度、动态避障、出库库存闭环和智慧 BI 大屏。

**设备和运输是模拟，HAP 存储是真实的。** 本项目不是工业机器人安全控制系统。大屏入口为 /#command-center。

## 本地开发

使用现代 Node.js（建议 Node 22+），运行 npm ci、npm test、npm run build。

复制 .env.example 为 .env，在本机填写自己的 HAP 凭据，再运行 node --env-file=.env server.mjs。另开终端运行 npm run dev。前端访问 http://127.0.0.1:5173，API 仅绑定 127.0.0.1:8787。

NEXUS_LOCAL=1 会跳过本地身份校验，只用于回环开发。生产必须去掉该变量、保留 Compute auth:true，并在 NEXUS_OPERATORS 配置该应用登录网关的操作员 ID。不要将凭据放入前端或提交 Git。

## HAP 与部署

store.mjs、projection.mjs 包含演示项目的工作表 ID（不是凭据）。复用本项目需要创建自己的工作表、配置字段别名并替换这些 ID。字段清单见 docs/ARCHITECTURE.md。不要把公开代码中的 ID 当作访问授权。

运行 npm run build 后生成 public/。通过 HAP Compute CLI 预审、部署；数据库和文件存储开关均为 false。服务端配置 HAP_APPKEY、HAP_SIGN、NEXUS_OPERATORS，生产不配置 NEXUS_LOCAL。更改环境变量后重新部署。

## 文档

- docs/DEVELOPMENT-HISTORY.md：需求演进和发布记录
- docs/ARCHITECTURE.md：结构、数据流和字段契约
- docs/HANDOFF.md：接手记忆、边界与后续优化

本仓库从当前源码整理而来，不包含原始 Git 历史或原始聊天记录；开发历史是基于实际开发记录整理的摘要。未包含真实业务导出、截图、账号凭据、依赖目录或旧版临时补丁脚本。

