// zlibjs 의 gunzip.min.js 는 최상위 this 에 Zlib 을 붙이는 옛 방식이라 ES 모듈 번들에서는 this 가 없어 실패한다.
// 원본 코드를 문자열로 가져와 별도 객체를 this 로 실행하고, kuromoji 가 쓰는 Zlib 만 내보낸다.
//
// 또 서버가 .gz 파일에 Content-Encoding: gzip 을 붙이면 브라우저가 미리 풀어서 넘겨준다.
// 그때는 gzip 서명(1f 8b)이 없으므로 받은 데이터를 그대로 돌려준다.
import code from '../../node_modules/zlibjs/bin/gunzip.min.js?raw';

interface GunzipInstance {
  decompress(): Uint8Array;
}

interface ZlibScope {
  Zlib?: { Gunzip: new (data: Uint8Array) => GunzipInstance };
}

const scope: ZlibScope = {};
new Function(code).call(scope);

const Original = scope.Zlib?.Gunzip;
if (!Original) throw new Error('zlibjs 를 초기화하지 못했어요');

export function isGzip(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

class Gunzip implements GunzipInstance {
  private readonly data: Uint8Array;
  constructor(data: Uint8Array) {
    this.data = data;
  }
  decompress(): Uint8Array {
    return isGzip(this.data) ? new Original!(this.data).decompress() : this.data;
  }
}

export const Zlib = { Gunzip };
export default { Zlib };
