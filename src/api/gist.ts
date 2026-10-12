// GitHub Gist 를 동기화 저장소로 쓴다. 비공개 Gist 하나에 백업 JSON 파일 하나.
// 토큰(gist 권한만)은 이 기기 브라우저에만 저장한다.
export const SYNC_FILE = 'jp-talk-day-sync.json';
const API = 'https://api.github.com';

export class GistError extends Error {}

interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GistError('GitHub 에 연결하지 못했어요.');
  }
  if (res.status === 401) throw new GistError('토큰이 올바르지 않거나 만료됐어요.');
  if (res.status === 403 || res.status === 404) throw new GistError('토큰에 Gist 권한이 없어요. gist 권한을 켠 토큰을 만들어 주세요.');
  if (!res.ok) throw new GistError(`GitHub 오류 (${res.status})`);
  return (await res.json()) as T;
}

// 동기화용 Gist 를 찾고, 없으면 비공개로 만든다.
export async function findOrCreateGist(token: string): Promise<string> {
  for (let page = 1; page <= 10; page++) {
    const gists = await request<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const found = gists.find((g) => SYNC_FILE in g.files);
    if (found) return found.id;
    if (gists.length < 100) break;
  }
  const created = await request<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: '일본에서의 하루 - 학습 기록 동기화',
      public: false,
      files: { [SYNC_FILE]: { content: '{}' } },
    }),
  });
  return created.id;
}

// 동기화 파일 내용. 아직 비어 있으면 null.
export async function downloadSync(token: string, gistId: string): Promise<string | null> {
  const gist = await request<Gist>(token, `/gists/${gistId}`);
  const file = gist.files[SYNC_FILE];
  if (!file) return null;
  let content = file.content ?? '';
  // 1MB 를 넘으면 API 응답에서 잘리므로 원본 주소로 받는다
  if (file.truncated && file.raw_url) {
    try {
      const res = await fetch(file.raw_url);
      if (!res.ok) throw new Error(String(res.status));
      content = await res.text();
    } catch {
      throw new GistError('동기화 파일을 받지 못했어요.');
    }
  }
  const trimmed = content.trim();
  return trimmed === '' || trimmed === '{}' ? null : content;
}

export async function uploadSync(token: string, gistId: string, content: string): Promise<void> {
  await request<Gist>(token, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [SYNC_FILE]: { content } } }),
  });
}
