# 쉬운출결 · 담임 개인용 (GitHub–Vercel)

기존 class-calendar와 분리된 새 앱입니다. 정왕고 교표는 없고, 하단 ‘정왕고 김민환’ 제작자 표기는 유지합니다.

각 담임이 자기 출결함을 만들고 QR 또는 연결 코드로 본인 휴대폰·PC를 연결합니다. 자료는 서버에 암호화해 저장하며 담임별로 분리합니다. 브라우저에는 기기 연결용 HttpOnly 쿠키를 저장합니다. 기존 앱의 학생 자료·비밀번호·암호화 키를 포함하지 않습니다.

## 처음 배포하기

1. GitHub에서 `easy-attendance-personal` 같은 **새 비공개 저장소**를 만듭니다. 이 폴더 안의 파일을 올립니다. 기존 `class-calendar`에 덮어쓰지 마세요. `api`, `lib`, `public`, `scripts`, `tests` 폴더와 `package.json`, `package-lock.json`, `vercel.json`이 저장소 최상위에 있어야 합니다.
2. Vercel에서 Add New → Project → 새 저장소를 Import합니다. Framework는 Other, Build Command는 `npm run build`, Output Directory는 `public`입니다. `vercel.json`에 설정되어 있습니다.
3. 새 프로젝트의 Storage에서 **새 Neon 데이터베이스**를 생성·연결합니다. 기존 학교 앱의 저장소를 연결하지 마세요. `DATABASE_URL`이 Production 환경에 추가되었는지 확인합니다.
4. Storage에서 **새 Blob 저장소를 Private로** 생성·연결합니다. 생성된 `BLOB_READ_WRITE_TOKEN` 또는 `BLOB_STORE_ID`를 사용합니다. 학생 첨부파일을 Public 저장소에 두지 마세요.
5. Settings → Environment Variables에 `DATA_KEY`를 추가합니다. 아래 명령으로 만든 64자리 값을 넣습니다. 다른 사람에게 공유하거나 GitHub에 올리지 마세요.

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. `APP_ORIGIN`에 최종 운영 주소를 넣습니다. 예: `https://easy-attendance-personal.vercel.app`. 주소를 바꾸면 이 값도 바꾼 뒤 다시 배포하고, 새 나이스 도우미를 다시 설치합니다.
7. Redeploy합니다. 연결된 데이터베이스에 필요한 빈 테이블이 빌드 중 생성됩니다. 실제 학생자료는 자동으로 추가되지 않습니다.
8. 앱의 ‘처음 시작’에서 출결함을 만듭니다. 복구 코드를 보관하고 ‘내 기기 연결·설정’에서 다른 기기를 연결합니다. PC에는 이 앱에서 내려받은 **개인용 나이스 도우미**를 별도로 설치합니다.

`DATA_KEY`를 바꾸거나 잃으면 기존 암호화 자료를 읽지 못합니다. 보관하세요. 초기 화면에 ‘배포 설정이 필요합니다’가 나오면 저장소·환경변수를 연결한 뒤 다시 배포합니다.

## 확인

```sh
npm ci
npm test
npm run build
```

테스트는 가상 자료로 출결함 분리, 기기 연결·해제, 만료·일회용 연결 코드, 복구, 동시 수정 충돌, 명렬표 범위, 저장 암호화를 확인합니다. 실제 Neon·Blob 연결과 운영 주소에서의 최종 동작은 배포 후 확인해야 합니다.

공통 앱 주소는 다른 선생님에게 전달해도 됩니다. **내 출결함 연결 QR·코드·복구 코드는 본인 기기 연결에만 사용하세요.** 같은 주소여도 새 출결함을 만든 다른 담임과 자료를 공유하지 않습니다.

처음 만든 ChatGPT Site와 Vercel 앱은 별도 저장소를 사용합니다. 기존 Site에서 만든 출결함·연결 코드가 Vercel 앱으로 자동 이전되지는 않습니다.
