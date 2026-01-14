# LiteLLM 프로젝트 구조 분석 (Vibe Coding LLM 참조용)

## 프로젝트 개요

LiteLLM은 100개 이상의 LLM 제공자(OpenAI, Anthropic, VertexAI 등)를 위한 통합 인터페이스를 제공하는 오픈소스 라이브러리입니다. Python SDK와 Proxy Server(OpenAI 호환 API)의 두 가지 주요 형태로 사용됩니다.

## 디렉토리 구조 요약

### Root Directory

- **`litellm/`**: 핵심 라이브러리 및 Proxy Server 코드가 포함된 메인 패키지입니다.
- **`ui/`**: Next.js 기반의 관리자 대시보드 프론트엔드 코드입니다.
- **`enterprise/`**: 엔터프라이즈 전용 기능 (라이선스, SSO 등)이 포함된 디렉토리입니다.
- **`docs/`**: 문서화 파일들입니다.
- **`tests/`**: 테스트 코드 모음입니다.
- **`ci_cd/`, `deploy/`, `docker/`**: 배포 및 CI/CD 관련 스크립트입니다.
- **`pyproject.toml`**: Python 프로젝트 의존성 및 설정 파일입니다.
- **`schema.prisma`**: 데이터베이스 스키마 정의 (Prisma ORM).

---

## 1. Core Library (`litellm/`)

이 디렉토리는 라이브러리의 핵심 로직을 담고 있습니다.

- **`main.py`**:
  - `completion()`, `embedding()` 등 핵심 함수가 정의된 엔트리 포인트입니다.
  - 사용자가 가장 먼저 상호작용하는 부분입니다.
- **`llms/`**:
  - 각 LLM 제공자별 구현체가 모여 있습니다 (`openai`, `anthropic`, `vertex` 등).
  - 각 파일은 해당 제공자의 API 호출, 스트리밍, 에러 매핑을 처리합니다.
- **`router.py`**:
  - 로드 밸런싱, Fallback 로직, 재시도 메커니즘을 담당합니다.
- **`utils.py`**:
  - 공통 유틸리티 함수 (토큰 계산, 입력 유효성 검사 등)가 포함되어 있습니다.
- **`types/`**:
  - Pydantic 모델 및 타입 정의 (`utils.py` 및 API 요청/응답 객체)가 있습니다.
- **`integrations/`**:
  - 로깅, 모니터링 툴 (Langfuse, Datadog 등)과의 연동 로직입니다.
- **`caching/`**:
  - 응답 캐싱 로직 (Redis, S3, In-memory 등)입니다.

## 2. Proxy Server (`litellm/proxy/`)

OpenAI 호환 API를 제공하는 FastAPI 서버입니다.

- **`proxy_server.py`**:
  - FastAPI 앱의 진입점입니다. 라우팅 설정 및 미들웨어 초기화가 여기서 이루어집니다.
- **`auth/`**:
  - API Key 관리, JWT 인증, OAuth 관련 로직입니다.
- **`db/`**:
  - 데이터베이스 연결 및 Prisma 클라이언트 관리 로직입니다.
- **`endpoints/` (및 기타 `*_endpoints/`)**:
  - 구체적인 API 엔드포인트 핸들러들입니다 (`key_management`, `user_management` 등).
- **`pass_through_endpoints/`**:
  - 특정 제공자에게 그대로 요청을 전달하는 엔드포인트입니다.
- **`guardrails/`**:
  - 입력/출력 필터링 및 보안 검사 로직입니다.
- **`schema.prisma`**:
  - 데이터베이스 테이블 구조 정의 (PostgreSQL/SQLite 지원).

## 3. Frontend (`ui/`)

- **`litellm-dashboard/`**:
  - 사용량 모니터링, 키 관리 등을 위한 Next.js 웹 애플리케이션입니다.
  - Proxy 서버와 통신하며, 일반적으로 Proxy 서버 내에서 정적 파일로 서빙되거나 별도로 배포됩니다.

## 4. Enterprise (`enterprise/`)

- 오픈소스 버전 외의 상용 기능이 포함되어 있습니다.
- 별도의 라이선스 키가 필요하며, 고급 보안 기능이나 SSO 등이 구현되어 있습니다.

## 주요 설정 파일

- **`pyproject.toml`**:
  - `[tool.poetry.dependencies]`: 핵심 의존성 (`openai`, `fastapi`, `prisma` 등).
  - `[tool.poetry.extras]`: `proxy`, `extra_proxy` 등 기능을 켜고 끄는 옵션.
  - `[tool.poetry.scripts]`: `litellm`(서버 실행), `litellm-proxy`(CLI) 명령어 정의.
- **`proxy_config.yaml`** (예시):
  - 모델 리스트, API 키, 라우팅 규칙 등을 정의하는 설정 파일입니다.

## 개발 워크플로우 (참조)

- **설치**: `make install-dev` (개발용), `make install-proxy-dev` (Proxy 개발용).
- **테스트**: `make test` (전체), `poetry run pytest tests/path/to/test.py` (개별).
- **실행**: `poetry run litellm --config proxy_config.yaml` (Proxy 서버 실행).

---
**Tip for Vibe Coding LLM**:
코드를 수정할 때는 `litellm/main.py`(Core 로직 수정 시) 또는 `litellm/proxy/proxy_server.py`(Proxy 서버 수정 시)를 시작점으로 잡고, 관련된 모듈(`llms/`, `auth/` 등)로 파고드는 것이 좋습니다. 데이터베이스 변경이 필요하면 `schema.prisma`를 수정하고 `prisma migrate`를 수행해야 합니다.
