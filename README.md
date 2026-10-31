# prompt-mark

Claude Code mod. 대화 화면에서 **내가 쓴 메시지**를 확실하게 구분한다.

- 줄마다 왼쪽에 색 막대 `▌`, 밝은 강조색 굵은 글씨, 줄 전체 폭의 회색 배경
- 긴 문장은 mod 가 폭에 맞춰 줄을 나눠서, 감싼 줄마다 막대가 이어진다(한글은 2칸)
- **아직 전달 안 된 대기 중 메시지는 흐리게** 보였다가, 전달되면 강조색으로 바뀐다
  - 작업 중에 보낸 `/명령` 도 같다(실행되거나 작업이 끝나면 풀림)
- 작업 알림·다른 에이전트의 메시지 같은 행은 건드리지 않는다
- 처리가 끝난 뒤의 `❯ /명령` 줄은 엔진이 mod 를 거치지 않고 그려서 바꿀 수 없다(명령 출력 줄 `⎿ …` 은 그대로)

## 이미지 표시 (0.2.0, 옛 inline-image 통합)

PNG 이미지를 대화창 안에 바로 그린다. 셸·외부 도구 없이 Claude Code 공식 `Image` 요소만 써서 **Windows에서도 동작**한다.

- **붙여넣은 이미지**: 내 메시지 텍스트 바로 아래에 다시 보여준다(메시지 줄을 이 mod가 그리므로 다른 mod와 순서가 엇갈리지 않음)
- **`show_image` 도구**(`mcp__prompt-mark__show_image`): Claude가 PNG 경로를 넘기면 결과 줄 아래에 표시. `C:\...` 경로 지원
- **Read 결과**: Claude가 Read로 읽은 PNG를 그 줄 아래에 표시("Read 2 files"로 접힌 줄 포함)

조건: kitty 그래픽 프로토콜을 그리는 터미널(Ghostty, kitty, Orca, wintty 등). 터미널 이름을 Claude Code가 모르면 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`.

한계:

- **PNG만**, 2 MiB까지. JPEG·GIF 등은 건너뛴다
- 재시작·`/reload-plugins` 후에는 그 전에 붙여넣은 이미지가 다시 그려지지 않는다(`show_image` 결과는 파일이 남아 있으면 다시 읽어 그림)
- 모바일 등 터미널이 아닌 화면에는 그리지 않는다

## 옵션

`/config` 의 플러그인 설정(또는 settings.json `pluginConfigs["prompt-mark"].options`):

- `barColor` (기본 `#38bdf8`): 막대 색
- `textColor` (기본 `#7dd3fc`): 글자 색
- `bgColor` (기본 `#373737`): 줄 배경색, 비우면 배경 없음

색은 이름(`cyan`, `magenta`…) 또는 `#hex`.

## 설치

Claude Code 2.1.287 이상(mods).

```
/plugin marketplace add duddudcns/claude-plugins
/plugin install prompt-mark@duddudcns
```

비공개 저장소라 GitHub 접근 권한과 로그인(`gh auth login`)이 필요하다.

## 개발

- `claude plugin validate .` / `claude plugin test .`
- 폴더에 빈 `.debug` 파일을 두면 세션에 들어오는 행과 그려지는 행을 `.debug-dump.json` 에 기록한다.
