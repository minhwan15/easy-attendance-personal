const extensionScreen = new URL('./assets/neis-extension-install.png', import.meta.url).href;

export function chromeNeisNoticeHtml(){
 return '<section class="section-info" aria-label="나이스 자동입력 사용 안내"><strong>나이스 자동입력은 PC Chrome에서</strong><p>같은 Chrome 창에서 쉬운출결과 나이스를 각각 탭으로 열어 주세요.</p><a class="btn small" href="https://goe.neis.go.kr/" target="_blank" rel="noopener noreferrer">나이스 열기 · 새 탭</a><small style="display:block;margin-top:6px">현재 브라우저에서 열립니다. Chrome에서 이용해 주세요.</small></section>';
}

/** Shared, optional instructions for the queue and the experience export dialog. */
export function neisGuideHtml({ experience = false, exam = false, chromeNotice = true } = {}) {
  if(chromeNotice)return '<p class="helper-note">같은 PC Chrome에서 나이스를 열고 도우미로 입력하세요. 설치 안내는 <a href="/notebook.html">홈화면</a>에서 확인할 수 있습니다.</p>';
  return `${chromeNotice?chromeNeisNoticeHtml():''}<section class="section-info"><strong>쉬운출결 개인용 나이스 입력 도우미</strong><p>처음 설치하거나 도우미를 업데이트할 때 내려받으세요.</p><div class="helper-download-row"><a class="btn small primary" href="/downloads/easy-attendance-helper.zip?v=1.0.3" download>나이스 도우미 다운로드 · 1.0.3 · 2026.10.16 업데이트</a><strong class="helper-release-highlight">일괄 입력 성공률 향상</strong></div></section><details class="helper-setup neis-guide" data-neis-setup>
    <summary>나이스 입력 도우미 · 설치부터 사용까지 따라 하기</summary>
    <div class="neis-guide-body">
      <p class="neis-guide-intro">PC의 같은 Chrome에서 ${exam?'고사 캘린더':'기록함'}과 나이스를 각각 탭으로 여세요. 설치는 처음 한 번만 하면 됩니다.</p>
      <section><h3>1. 처음 한 번 · 도우미 설치</h3>
        <ol>
          <li><strong>위 다운로드 버튼</strong>을 눌러 ZIP 파일을 받습니다.</li>
          <li>내려받은 ZIP 파일을 <strong>마우스 오른쪽 버튼으로 클릭 → 압축 풀기</strong>를 누릅니다. 압축을 푼 폴더의 위치를 기억해 두세요.</li>
          <li>Chrome에서 새 탭을 열고, 맨 위 <strong>주소창</strong>에 <button class="btn small" type="button" data-copy-extension-address title="확장 프로그램 주소 복사">chrome://extensions · 주소 복사</button>를 입력한 뒤 <strong>Enter</strong>를 누릅니다. ‘확장 프로그램’ 화면이 열립니다.</li>
          <li>화면 <strong>오른쪽 위 ‘개발자 모드’</strong> 스위치를 켭니다. 켜지면 파란색으로 표시됩니다.</li>
          <li>화면 <strong>왼쪽 위 ‘압축해제된 확장프로그램 로드’</strong>를 누릅니다. Chrome 버전에 따라 ‘압축해제된 확장 프로그램을 로드합니다’로 표시될 수 있습니다.</li>
          <li>2번에서 압축을 푼 폴더를 엽니다. <strong>manifest.json 파일이 들어 있는 폴더</strong>를 선택하고 <strong>폴더 선택</strong>을 누릅니다. ZIP 파일이나 manifest.json 파일 자체를 선택하는 단계가 아닙니다.</li>
          <li><strong>‘쉬운출결 개인용 → 나이스 도우미 1.0.3’</strong> 카드가 나타나고 오른쪽 아래 스위치가 파란색이면 설치가 끝났습니다. ${exam?'고사 캘린더':'기록함'}으로 돌아와 <strong>새로고침</strong>하세요.</li>
        </ol>
        <figure><a href="${extensionScreen}" target="_blank" rel="noopener" aria-label="크롬 설치 화면 크게 보기"><img src="${extensionScreen}" alt="크롬 확장 프로그램 화면: 오른쪽 위 개발자 모드가 켜져 있고, 왼쪽 위에 압축해제된 확장프로그램 로드 버튼이 있습니다." width="1917" height="143" loading="lazy"></a><figcaption>오른쪽 위에서 개발자 모드를 켠 뒤, 왼쪽 위 로드 버튼을 누르세요. 그림을 누르면 크게 볼 수 있습니다.</figcaption></figure>
      </section>
      <section><h3>2. 사용할 때마다 · ${exam?'고사 캘린더':'기록함'}에서 보내기</h3>
        <ol>
          <li>${exam?'PC에서 고사 캘린더를 열고 <strong>반과 월</strong>을 선택하세요. 최신 일정 확인을 눌러 변경된 날짜를 반영하세요.':'폰에서 작성했다면 <strong>연결한 PC</strong>에서 내 출결함을 엽니다. 새로고침해 기록을 불러오세요.'}</li>
          <li>${exam ? '고사 캘린더에서 반과 월을 고른 뒤 <strong>확정 고사 나이스로 보내기</strong>를 누르세요. 한 학생만 보내려면 고사 상세에서 <strong>나이스 출석인정 입력</strong>을 누르세요. 확정 날짜와 출석인정 결석 사유를 확인합니다.' : experience ? '체험학습 표에서 입력할 학생의 <strong>날짜 칸</strong>을 선택합니다. 신청서 날짜를 입력·저장한 뒤 보낼 주를 선택하고 <strong>이 주의 미입력 기록 확인</strong>을 누릅니다. 나이스 결재는 나이스에서 처리합니다.' : '<strong>나이스 입력 대기함</strong>을 누르고, 보낼 기록 왼쪽의 <strong>체크박스</strong>를 선택합니다. 준비가 완료되지 않은 기록은 해당 기록을 열어 학생·날짜·입력 내용을 채우고 저장하세요.'}</li>
          <li><strong>${exam?'출석인정으로 보내기':'선택한 기록 보내기'}</strong>를 누릅니다. 전달 완료 안내가 나오면 다음 단계로 이동하세요.</li>
        </ol>
      </section>
      <section><h3>3. 나이스에서 · 여러 학생·날짜 자동 입력</h3>
        <ol>
          <li>같은 Chrome의 다른 탭에서 <strong>나이스에 직접 로그인</strong>합니다. 해당 반의 <strong>일일출결관리(담임용)</strong> 화면을 열어 두세요.</li>
          <li>1.0.3에서는 앱에서 보내기 버튼을 누르면 <strong>도우미 패널이 자동으로 열립니다.</strong> 열린 패널을 그대로 두고 나이스 탭으로 이동하세요. 열리지 않으면 Chrome <strong>오른쪽 위 퍼즐 모양 🧩 → 담임 기록 → 나이스 입력 도우미</strong>로 여세요.</li>
          <li>패널의 <strong>학생 · 날짜 선택</strong>에서 입력할 기록을 고릅니다. 나이스에서는 해당 <strong>반의 출결표</strong>를 열어 두세요. 날짜는 도우미가 선택하며 날짜 변경으로 표가 갱신되면 조회 버튼은 따로 누르지 않습니다. 처음 연 빈 출결표가 자동 갱신되지 않을 때만 도우미가 조회를 누릅니다. 도우미가 일자 옆 달력 버튼을 눌러 연 뒤, 이전달·다음달로 이동해 해당 날짜를 클릭합니다. 열린 출결마감구분 팝업은 닫아 주세요.</li>
          <li><strong>학생 찾아 자동입력</strong>을 누릅니다. 도우미가 날짜를 선택하고 반·날짜·학생 이름·번호를 대조하고 해당 학생 행을 선택한 뒤 마감 창을 열고, 종류·구분·사유를 입력하고 적용합니다.</li>
          <li>지각은 <strong>마지막 빠진 교시</strong>, 조퇴는 <strong>처음 빠진 교시</strong>를 자동 클릭합니다. 지각은 클릭한 교시까지 포함하고, 조퇴는 종례까지 포함합니다. 결석은 전체 표시를 확인합니다.</li>
          <li>도우미가 나이스 저장과 확인창을 처리하고 다음 학생·날짜로 넘어갑니다. 저장 성공을 확인한 날짜만 완료로 기록합니다. 기존 출결 내용은 보낸 기록으로 덮어씁니다.</li>
          <li>작업이 끝나면 <strong>미입력 목록</strong>을 확인합니다. 저장하지 못한 건은 완료 처리하지 않습니다. ${exam?'다음 학생·날짜의 화면을 열고 패널에서 다음 기록을 선택해 반복하세요.':'완료한 날짜는 ‘나이스 입력 완료’로 표시되고 다시 전송하지 않습니다. 여러 날짜 중 일부만 끝냈다면 남은 날짜만 선택해 보낼 수 있습니다.'}</li>
        </ol>
        <p class="neis-guide-note">결석·지각·조퇴의 학생 행 입력을 지원합니다. 나이스에서 반을 선택하고 일일출결관리 화면만 열어 두세요. 달력 열기 버튼을 식별하지 못하는 화면에서는 날짜 입력칸을 사용합니다. 자동 날짜 선택이 되지 않으면 일자 옆 달력을 열어 둔 뒤 다시 누르세요. 결과·외출의 교시별 클릭 방식은 확인 전이므로 직접 입력을 사용하세요. 실제 나이스 PC에서는 먼저 한 건으로 동작을 확인해 주세요.</p>
      </section>
      <section><h3>막히면 이렇게 하세요</h3>
        <dl>
          <dt>도우미 패널에 기록이 없어요</dt><dd>${exam?'고사 캘린더를 새로고침하고 ‘출석인정으로 보내기’':'기록함을 새로고침하고 ‘선택한 기록 보내기’'}를 다시 누르세요. 연결되지 않으면 확장프로그램이 켜져 있는지 확인하고 앱을 새로고침한 뒤 다시 보내 주세요. 연결 문제만으로 재설치할 필요는 없습니다.</dd>

          <dt>어떤 수정에 도우미 업데이트가 필요한가요?</dt><dd>이름 검색, 기록 작성, 날짜·교시 검증, 전송 준비와 완료 관리는 앱을 새로고침하면 적용됩니다. 나이스 화면의 버튼·입력칸이 바뀌거나 도우미 자체에 새 기능을 넣을 때만 도우미 업데이트가 필요합니다. Chrome 개발자 모드 설치본은 자동 업데이트되지 않습니다.</dd><dt>앱에서 도우미가 자동으로 열리나요?</dt><dd>1.0.3에서는 앱의 보내기 버튼을 누르면 패널이 자동으로 열립니다. 열리지 않을 때만 확장프로그램 아이콘으로 여세요. 도우미 1.0.3으로 한 번 업데이트하면 보내기 버튼을 누를 때 패널이 자동으로 열립니다. 0.3.29는 기존처럼 아이콘으로 열어 사용하세요.</dd><dt>도우미 자체 업데이트가 꼭 필요할 때</dt><dd>새 ZIP의 압축을 기존 도우미 폴더에 풀어 파일을 교체하세요. <button class="btn small" type="button" data-copy-extension-address title="확장 프로그램 주소 복사">chrome://extensions · 주소 복사</button>에서 도우미 카드의 <strong>동그란 화살표 ↻</strong>를 누르고, 기록함과 나이스 탭도 새로고침하세요. 기존 폴더를 찾기 어렵다면 기존 도우미를 제거하고 1번 설치 순서대로 새 폴더를 등록하세요.</dd>
        </dl>
      </section>
    </div>
  </details>`;
}


