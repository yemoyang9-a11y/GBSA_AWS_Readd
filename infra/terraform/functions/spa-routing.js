function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // 확장자가 있는 요청(정적 에셋)은 그대로 두고, 나머지는 React Router 라우트로 보고
  // index.html로 넘긴다 — 새로고침/직접 진입 시 S3에 실제 객체가 없어 403이 나던 문제.
  var lastSegment = uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
