// 구글 드라이브 백업 연동. drive.file 스코프만 사용한다 — 이 앱이 만든 파일/폴더에만
// 접근할 수 있는 최소 권한이라, 사용자 드라이브의 다른 파일에는 전혀 접근하지 못한다.
// 서버 비밀키 없이 클라이언트에서 바로 토큰을 받는 Google Identity Services의
// 토큰 클라이언트 방식을 쓴다(OAuth 암묵적 흐름과 비슷하되 GIS가 안전하게 감싸준다).

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FOLDER_NAME = "무빙툰 스튜디오 백업";
const FOLDER_ID_STORAGE_KEY = "movingtoon_drive_backup_folder_id";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("구글 인증 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

// 같은 세션에서 반복 백업할 때마다 매번 로그인 창을 띄우지 않도록, 받은 토큰을
// 메모리에만 잠깐 캐시한다(새로고침하면 사라지고, 그때는 다시 동의를 받는다).
let cachedToken: { value: string; expiresAt: number } | null = null;

export class GoogleClientIdMissingError extends Error {}

/** 팝업 창은 사용자 클릭과 "동기적으로 이어져 있어야" 브라우저가 막지 않는다.
 *  exportBackup()처럼 오래 걸리는 작업 뒤에 토큰을 요청하면 그 사이 지연 때문에
 *  팝업이 차단되므로, 클릭 핸들러 맨 앞에서 즉시 이 함수부터 호출해 인증을
 *  먼저 끝내둔다(이미 캐시된 토큰이 있으면 팝업 없이 바로 반환된다). */
export async function requestDriveAccess(): Promise<void> {
  await getAccessToken();
}

async function getAccessToken(forcePrompt = false): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new GoogleClientIdMissingError("구글 클라이언트 ID가 설정되지 않았습니다.");
  }

  if (!forcePrompt && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "구글 인증에 실패했습니다."));
          return;
        }
        // 응답에 정확한 만료 시각이 없어 넉넉히 50분으로 잡는다(실제 만료는 보통 1시간).
        cachedToken = { value: response.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
  });
}

interface DriveFile {
  id: string;
  name: string;
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// drive.file 스코프는 "이 앱이 만든 파일"만 보이므로, 이전에 이 앱으로 만든 백업
// 폴더가 있으면 그걸 찾아 재사용하고, 없으면(최초 1회) 새로 만든다.
async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  const cachedId = typeof window !== "undefined" ? localStorage.getItem(FOLDER_ID_STORAGE_KEY) : null;
  if (cachedId) return cachedId;

  const query = encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const listRes = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`
  );
  if (listRes.ok) {
    const body = (await listRes.json()) as { files?: DriveFile[] };
    const existing = body.files?.[0];
    if (existing) {
      localStorage.setItem(FOLDER_ID_STORAGE_KEY, existing.id);
      return existing.id;
    }
  }

  const createRes = await driveFetch(accessToken, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!createRes.ok) {
    throw new Error("드라이브에 백업 폴더를 만들지 못했습니다.");
  }
  const created = (await createRes.json()) as DriveFile;
  localStorage.setItem(FOLDER_ID_STORAGE_KEY, created.id);
  return created.id;
}

/** 백업 zip Blob을 구글 드라이브의 전용 폴더에 업로드한다. 폴더가 없으면 처음 한 번만
 *  만들고, 이후에는 같은 폴더를 계속 재사용한다. */
export async function uploadBackupToDrive(
  blob: Blob,
  fileName: string,
  onProgress?: (phase: string, percent: number) => void
): Promise<void> {
  onProgress?.("구글 계정 인증 중", 10);
  const accessToken = await getAccessToken();

  onProgress?.("백업 폴더 확인 중", 40);
  const folderId = await findOrCreateBackupFolder(accessToken);

  onProgress?.("드라이브에 업로드 중", 70);
  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const uploadRes = await driveFetch(
    accessToken,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", body: form }
  );

  if (!uploadRes.ok) {
    // 캐시된 폴더 id가 이제는 유효하지 않을 수 있다(사용자가 드라이브에서 직접
    // 지운 경우 등) — 다음 시도 때 새로 찾거나 만들도록 캐시를 비운다.
    if (uploadRes.status === 404) {
      localStorage.removeItem(FOLDER_ID_STORAGE_KEY);
    }
    throw new Error("드라이브 업로드에 실패했습니다.");
  }
  onProgress?.("완료", 100);
}

/** 백업 폴더의 구글 드라이브 웹 페이지 URL을 반환한다(없으면 먼저 만든다). */
export async function getBackupFolderUrl(): Promise<string> {
  const accessToken = await getAccessToken();
  const folderId = await findOrCreateBackupFolder(accessToken);
  return `https://drive.google.com/drive/folders/${folderId}`;
}
