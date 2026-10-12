// kuromoji 의 DictionaryLoader 가 사전 주소를 만들 때 쓰는 path.join 만 브라우저용으로 제공한다.
export function join(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

export default { join };
