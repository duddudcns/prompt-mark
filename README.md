# prompt-mark

Claude Code mod. 대화 화면에서 **내가 쓴 메시지**를 확실하게 구분한다.

- 줄마다 왼쪽에 색 막대 `▌`, 밝은 강조색 굵은 글씨, 줄 전체 폭의 회색 배경
- 긴 문장은 mod 가 폭에 맞춰 줄을 나눠서, 감싼 줄마다 막대가 이어진다(한글은 2칸)
- **아직 전달 안 된 대기 중 메시지는 흐리게** 보였다가, 전달되면 강조색으로 바뀐다
  - 작업 중에 보낸 `/명령` 도 같다(실행되거나 작업이 끝나면 풀림)
- 작업 알림·다른 에이전트의 메시지 같은 행은 건드리지 않는다
- 처리가 끝난 뒤의 `❯ /명령` 줄은 엔진이 mod 를 거치지 않고 그려서 바꿀 수 없다(명령 출력 줄 `⎿ …` 은 그대로)

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
