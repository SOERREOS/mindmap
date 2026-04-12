# Spatial Research Mindmap — 개선 계획

## 완료된 작업
- [x] 비밀번호 인증 게이트 (`/reos` 숨은 명령으로 변경)
- [x] 영감 주사위 + 해킹 텍스트 애니메이션
- [x] 5+25 계층 마인드맵 구조
- [x] 클릭 시 카메라 줌인 + 그룹별 색상
- [x] 파티클 엣지, 그룹 오라, 커서 별빛, 아이들 드리프트
- [x] 미니맵, 저장/불러오기, PNG 내보내기
- [x] API 자동 폴백 (2.5-flash → 2.0-flash → lite)
- [x] JSON 파싱 강화 (마크다운 블록 제거)

---

## 진행 중 / 다음 작업

### 🔴 버그 수정
- [ ] **더블클릭 확장 작동 안 함** → `onNodeDoubleClick` 대신 `onNodeClick` 내부 타이머로 단/더블 구분
- [ ] **노드 가시성 오류** (어떤 건 흐리고 어떤 건 선명) → 기본 상태에서 depth는 scale에만 영향, opacity/blur는 선택 시에만 적용

### 🟡 UX 개선
- [ ] **큰 요소 선명하게** — 기본 상태 opacity ≥ 0.88, blur 없음
- [ ] **선택 시 하위 요소도 선명하게** — 같은 그룹 opacity 1.0, blur 0
- [ ] **정보 패널 이동** — 오른쪽 슬라이드 패널 제거 → 노드 바로 아래 인라인 텍스트
- [ ] **첫 페이지 힌트 텍스트 제거** ("Enter ↵ · 영감 주사위" 삭제)
- [ ] **검색창 호버 반응형** — 마우스 올리면 glow + 미세 scale 반응
- [ ] **불러오기 메인 페이지 노출** — 현재 하단 버튼, 더 눈에 띄게

### 🟢 시각 / 디자인
- [ ] **큰 요소 테두리 running light** — conic-gradient 회전 애니메이션 (윙윙 도는 빛)
- [ ] **전체 글씨 크기 확대** — 모든 노드 폰트 +2~3px
- [ ] **PNG 내보내기 선명하게** — export 시 exportMode로 모든 노드 opacity 1 강제

### 🔵 저장 / 내보내기
- [ ] **저장 경로 설정** — File System Access API (`showSaveFilePicker`) 사용, 브라우저 미지원 시 폴백 다운로드
- [ ] **PNG export 품질** — pixelRatio 3, 모든 요소 선명하게

---

## 기술 구현 메모

### Running Light Border
```css
@property --rota {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes border-spin {
  to { --rota: 360deg; }
}
.node-border-spin {
  animation: border-spin 3s linear infinite;
  background: conic-gradient(from var(--rota), transparent 0%, rgba(COLOR, 0.8) 8%, transparent 22%);
}
```
MainNode 내부: `position: relative` 래퍼 + `position: absolute; inset: -1.5px` 테두리 레이어

### 더블클릭 감지
```ts
// onNodeClick 내부 타이머 기반
if (lastClickRef.current === node.id) {
  clearTimeout(timer); // 더블클릭 → 확장
  handleExpand(node);
} else {
  timer = setTimeout(() => { /* 싱글클릭 → 선택/이동 */ }, 260);
}
```

### Export Mode
```ts
// SelectCtx에 exportMode 추가
// exportMode === true → 모든 노드 opacity 1, filter none
// 300ms 대기 후 toPng 캡처
```

### File System Access API
```ts
const handle = await window.showSaveFilePicker({ suggestedName: 'mindmap.png' });
const writable = await handle.createWritable();
await writable.write(blob);
await writable.close();
```

---

## 파일 구조
```
app/src/
  app/
    globals.css     ← running light 애니메이션 추가
    page.tsx        ← 힌트 제거, 호버 효과, export 개선
  components/
    Mindmap.tsx     ← 가시성 수정, 더블클릭 수정, 인라인 정보, 테두리 빛
    StarField.tsx   ← 유지
  lib/
    api.ts          ← 유지
    auth.ts         ← 유지
    dice.ts         ← 유지
    storage.ts      ← 유지
```
