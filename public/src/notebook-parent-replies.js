export const DEFAULT_PARENT_REPLIES = Object.freeze(['네. 나이스에 온라인 출결신고 부탁드립니다.','네, 확인했습니다. 나이스에 온라인 출결신고를 해 주세요.','네, 알겠습니다. 나이스에 온라인 출결신고도 부탁드립니다.']);
export function normalizeParentReplies(input = DEFAULT_PARENT_REPLIES) {
  if(!Array.isArray(input)||input.length!==3||input.some(value=>typeof value!=='string'||!value.trim()||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)))throw new Error('답장 3개를 각각 1~500자로 입력해 주세요.');
  return input.map(value=>value.trim());
}
