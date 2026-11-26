import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  enableNetwork,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

// 관리자 전용 허용 이메일
export const ADMIN_EMAIL = 'psrim2@gmail.com';

// Firebase 프로젝트 설정 (.env 환경변수 우선 적용 + 서버 재시작 전 즉시 동작을 위한 기본값)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCnCbEyOJNqixPn6z3T6bs5AJ1PhVzbjc8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'diary-app-c5698.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'diary-app-c5698',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'diary-app-c5698.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '122515137075',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:122515137075:web:9ec4d462d1d4a8af7fb946',
};

// Firebase 설정 완료 여부 체크
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app = null;
let auth = null;
let db = null;
let storage = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  // 브라우저 재시작/새로고침 시에도 자동 로그인이 계속 유지되도록 로컬 영구 세션 설정
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error('[Auth Persistence Error]', err);
  });
  db = getFirestore(app);
  storage = getStorage(app);
  // Storage 버킷 미활성화(무료 Spark 플랜 등) 또는 CORS 차단 시 2분간 무한 대기하지 않도록 재시도 시간 단축
  storage.maxUploadRetryTime = 2000;
  storage.maxOperationRetryTime = 2000;
  googleProvider = new GoogleAuthProvider();
}

export { app, auth, db, storage, googleProvider };

// iOS 또는 PWA 독립실행형(Standalone) 환경 감지
export function isIOSOrStandalonePWA() {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return isIOS || isStandalone;
}

/**
 * 1. 구글 계정 로그인 (iOS Standalone PWA 및 모바일/PC 모두에서 인앱 팝업 최우선 지원)
 */
export async function loginWithGoogle(forceSelectAccount = false) {
  if (!isFirebaseConfigured || !auth) {
    console.warn(
      '[Firebase] 환경변수(.env) 또는 src/firebase.js에 Firebase 설정 키를 입력해 주세요.'
    );
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  const provider = new GoogleAuthProvider();
  if (forceSelectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }

  // 1. signInWithPopup 최우선 시도
  // iOS Standalone PWA 및 모바일 브라우저 환경에서 외부 사파리로 튕기지 않고 인앱 인증 시트(WebSheet)로 가장 매끄럽고 안정적으로 로그인 완료
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    const errCode = String(err?.code || '').toLowerCase();
    const errMsg = String(err?.message || '').toLowerCase();

    // 사용자가 팝업/시트 창을 직접 닫거나 취소한 경우는 리디렉션하지 않고 즉시 종료
    if (
      errCode.includes('popup-closed-by-user') ||
      errCode.includes('user-cancelled') ||
      errMsg.includes('popup-closed-by-user')
    ) {
      throw err;
    }

    // 인앱 팝업이 차단되었거나 지원되지 않는 특수 환경에서만 signInWithRedirect로 자동 폴백
    console.warn('[Auth] signInWithPopup 실패, signInWithRedirect로 폴백 시도:', err);
    try {
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectErr) {
      console.error('[Auth] signInWithRedirect 실패:', redirectErr);
      throw redirectErr;
    }
  }
}

/**
 * 리디렉션 로그인 결과 확인 (모바일/PWA 리디렉션 복귀 시)
 */
export async function handleRedirectLoginResult() {
  if (!isFirebaseConfigured || !auth) return null;
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    console.error('[Auth] getRedirectResult 오류:', err);
    throw err;
  }
}

/**
 * 2. 로그아웃
 */
export async function logoutUser() {
  if (!isFirebaseConfigured || !auth) return;
  await signOut(auth);
}

/**
 * 구글 계정 로그인/연결 시 사용자 메타데이터를 Firestore 'users' 컬렉션에 기록
 * (어드민에서 연동자 수 및 활동 현황을 집계할 수 있도록 지원)
 * @param {import('firebase/auth').User} user
 */
export async function recordUserConnection(user) {
  if (!isFirebaseConfigured || !db || !user?.uid) return;
  try {
    const userRef = doc(db, 'users', user.uid);
    const data = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      providerId: user.providerData?.[0]?.providerId || 'google.com',
      lastConnectedAt: serverTimestamp(),
      lastConnectedAtMs: Date.now(),
    };
    await setDoc(userRef, data, { merge: true });
  } catch (err) {
    console.warn('[Firestore] 사용자 연동 정보 기록 실패:', err);
  }
}

/**
 * 구글 계정 연결자(users) 목록 및 카운트 실시간 구독 (어드민 전용)
 * @param {(users: Array<any>, count: number) => void} onUpdate
 * @param {(error: Error) => void} [onError]
 * @returns {() => void}
 */
export function subscribeToConnectedUsers(onUpdate, onError) {
  if (!isFirebaseConfigured || !db) {
    onUpdate([], 0);
    return () => {};
  }
  const usersRef = collection(db, 'users');
  return onSnapshot(
    usersRef,
    (snapshot) => {
      const usersList = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        usersList.push({
          id: d.id,
          uid: data.uid || d.id,
          email: data.email || '',
          displayName: data.displayName || '',
          photoURL: data.photoURL || '',
          providerId: data.providerId || 'google.com',
          lastConnectedAt: data.lastConnectedAt,
          lastConnectedAtMs: data.lastConnectedAtMs || 0,
        });
      });
      usersList.sort((a, b) => (b.lastConnectedAtMs || 0) - (a.lastConnectedAtMs || 0));
      try {
        localStorage.setItem('analog_diary_connected_users_count', String(snapshot.size));
      } catch {}
      onUpdate(usersList, snapshot.size);
    },
    (err) => {
      console.warn('[Admin] users 구독 오류:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 3. 인증 상태 변화 구독
 * @param {(user: import('firebase/auth').User | null) => void} callback
 */
export function subscribeToAuthChanges(callback) {
  if (!isFirebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      recordUserConnection(user).catch(() => {});
    }
    callback(user);
  });
}

// 초기 샘플 더미 데이터 ID 목록 (자동 정리 대상)
const LEGACY_SAMPLE_IDS = new Set(['entry-2026-11-15', 'entry-2026-11-17']);

/**
 * 4. 클라우드(Firestore) 다이어리 목록 실시간 구독
 * 경로: users/{uid}/diaries/{diaryId}
 */
export function subscribeToUserDiaries(uid, onUpdate, onError) {
  if (!isFirebaseConfigured || !db || !uid) return () => {};

  const diariesRef = collection(db, 'users', uid, 'diaries');
  let cachedDeletedIds = new Set();

  // 삭제된 묘비(tombstones) 백그라운드 실시간 캐싱 (메인 구독 블로킹 방지)
  let unsubscribeDeleted = () => {};
  try {
    const deletedRef = collection(db, 'users', uid, 'deleted_ids');
    unsubscribeDeleted = onSnapshot(
      deletedRef,
      (deletedSnap) => {
        cachedDeletedIds = new Set(deletedSnap.docs.map((d) => d.id));
      },
      (err) => {
        console.warn('[Firestore] deleted_ids 구독 경고:', err);
      }
    );
  } catch (err) {}

  const unsubscribeDiaries = onSnapshot(
    diariesRef,
    (snapshot) => {
      const cloudDiaries = [];
      snapshot.docs.forEach((docSnap) => {
        if (LEGACY_SAMPLE_IDS.has(docSnap.id) || cachedDeletedIds.has(docSnap.id)) {
          // 삭제된 묘비(tombstone)에 등록된 일기는 Firestore에서 영구 삭제
          deleteDoc(doc(db, 'users', uid, 'diaries', docSnap.id)).catch(() => {});
          return;
        }
        cloudDiaries.push({
          ...docSnap.data(),
          id: docSnap.id,
        });
      });
      // 날짜 기준 내림차순 정렬
      cloudDiaries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      onUpdate(cloudDiaries);
    },
    (error) => {
      console.error('[Firestore] 일기 구독 오류:', error);
      if (onError) onError(error);
    }
  );

  return () => {
    unsubscribeDiaries();
    unsubscribeDeleted();
  };
}

/**
 * 4-1. 절전 복귀(visibilitychange, focus 등) 시 Firestore 단발성 초고속 직접 동기화
 */
export async function fetchUserDiariesOnce(uid) {
  if (!isFirebaseConfigured || !db || !uid) return [];
  try {
    const diariesRef = collection(db, 'users', uid, 'diaries');
    const [diariesSnap, deletedSnap] = await Promise.all([
      getDocs(diariesRef),
      getDocs(collection(db, 'users', uid, 'deleted_ids')).catch(() => ({ docs: [] })),
    ]);

    const deletedIds = new Set(deletedSnap.docs.map((d) => d.id));
    const cloudDiaries = [];
    diariesSnap.docs.forEach((docSnap) => {
      if (LEGACY_SAMPLE_IDS.has(docSnap.id) || deletedIds.has(docSnap.id)) return;
      cloudDiaries.push({
        ...docSnap.data(),
        id: docSnap.id,
      });
    });
    cloudDiaries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return cloudDiaries;
  } catch (err) {
    console.warn('[Firestore] 일기 단발성 고속 조회 실패:', err);
    return [];
  }
}

/**
 * 4-2. 모바일 백그라운드 절전 복귀 시 끊어진 Firestore 네트워크 강제 재연결
 */
export async function reconnectFirebaseNetwork() {
  if (!isFirebaseConfigured || !db) return;
  try {
    await enableNetwork(db).catch(() => {});
  } catch {}
}

/**
 * 5. 단일 일기 저장 및 수정 (Firestore)
 * 경로: users/{uid}/diaries/{diary.id}
 */
export async function saveDiaryToCloud(uid, diary) {
  if (!isFirebaseConfigured || !db || !uid || !diary?.id) return;

  const diaryRef = doc(db, 'users', uid, 'diaries', String(diary.id));
  await setDoc(
    diaryRef,
    {
      ...diary,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 만약 이전에 삭제 목록에 등록된 적이 있다면 새로 작성/저장 시 삭제 묘비에서 제거
  try {
    await deleteDoc(doc(db, 'users', uid, 'deleted_ids', String(diary.id)));
  } catch (err) {}
}

/**
 * 6. 단일 일기 삭제 (Firestore)
 * 경로: users/{uid}/diaries/{diaryId}
 */
export async function deleteDiaryFromCloud(uid, diaryId) {
  if (!isFirebaseConfigured || !db || !uid || !diaryId) return;

  const diaryRef = doc(db, 'users', uid, 'diaries', String(diaryId));
  await deleteDoc(diaryRef);

  // 멀티 디바이스 간 삭제된 항목이 다른 기기를 켰을 때 다시 부활하지 못하도록 영구 묘비(tombstone) 등록
  try {
    const tombstoneRef = doc(db, 'users', uid, 'deleted_ids', String(diaryId));
    await setDoc(tombstoneRef, {
      id: String(diaryId),
      deletedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firestore] tombstone 등록 오류:', err);
  }
}

/**
 * 7. 비로그인 상태에서 작성했던 로컬 일기들을 로그인 직후 클라우드로 병합(마이그레이션)
 * 클라우드에 아직 없는 일기 ID만 일괄 업로드합니다.
 */
export async function syncLocalDiariesToCloud(uid, localDiaries = []) {
  if (!isFirebaseConfigured || !db || !uid || !Array.isArray(localDiaries) || localDiaries.length === 0) {
    return;
  }

  // 네트워크 지연으로 인한 동기화 무한 대기 방지 (최대 4초 타임아웃)
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 4000));

  const syncTask = async () => {
    try {
      const diariesRef = collection(db, 'users', uid, 'diaries');
      const existingSnap = await getDocs(diariesRef);
      const existingIds = new Set(existingSnap.docs.map((d) => d.id));

      // 삭제된 묘비(tombstones) 목록 조회 (다른 기기에서 이미 삭제한 일기는 절대 재업로드하지 않음)
      let deletedIds = new Set();
      try {
        const deletedSnap = await getDocs(collection(db, 'users', uid, 'deleted_ids'));
        deletedIds = new Set(deletedSnap.docs.map((d) => d.id));
      } catch (err) {}

      const batch = writeBatch(db);
      let hasNewItems = false;

      localDiaries.forEach((diary) => {
        const idStr = String(diary?.id || '');
        if (idStr && !LEGACY_SAMPLE_IDS.has(idStr) && !existingIds.has(idStr) && !deletedIds.has(idStr)) {
          const docRef = doc(db, 'users', uid, 'diaries', idStr);
          batch.set(docRef, {
            ...diary,
            updatedAt: serverTimestamp(),
          });
          hasNewItems = true;
        }
      });

      if (hasNewItems) {
        await batch.commit();
      }
    } catch (err) {
      console.warn('[Sync] 게스트 일기 업로드 중 오류:', err);
    }
  };

  await Promise.race([syncTask(), timeoutPromise]);
}

/**
 * 8. 사용자 설정(다이어리 이름 등) 실시간 구독
 * 경로: users/{uid}/settings/profile
 */
export function subscribeToUserSettings(uid, onUpdate) {
  if (!isFirebaseConfigured || !db || !uid) return () => {};

  const profileRef = doc(db, 'users', uid, 'settings', 'profile');
  return onSnapshot(
    profileRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data());
      }
    },
    (error) => {
      console.error('[Firestore] 사용자 설정 구독 오류:', error);
    }
  );
}

/**
 * 9. 다이어리 이름 클라우드 저장
 * 경로: users/{uid}/settings/profile
 */
export async function saveDiaryNameToCloud(uid, diaryName) {
  if (!isFirebaseConfigured || !db || !uid) return;

  const profileRef = doc(db, 'users', uid, 'settings', 'profile');
  await setDoc(
    profileRef,
    {
      diaryName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// 로컬 캐시 키 및 Storage 가용 상태 플래그
const LOCAL_DECORATIONS_KEY = 'analog_diary_decorations_cache';
let isStorageBucketAvailable = true;
const localDecorationListeners = new Set();

function readLocalDecorations() {
  try {
    const raw = localStorage.getItem(LOCAL_DECORATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDecorations(items) {
  try {
    localStorage.setItem(LOCAL_DECORATIONS_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[LocalCache] decorations 캐시 저장 실패:', e);
  }
  localDecorationListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function withTimeout(promise, ms, label = 'TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * SVG 파일 텍스트 정규화:
 * 1. xmlns 속성 보장
 * 2. viewBox 보장 (width/height만 있는 경우 viewBox 자동 생성)
 * 3. 고정 작은 width/height 제거하고 width="100%" height="100%" 로 변경하여
 *    아이폰 Safari / WebKit에서 32x32 등 저해상도 래스터라이징되는 현상 원천 차단
 */
export function normalizeSvgContent(svgString) {
  if (!svgString || typeof svgString !== 'string') return '';
  let svg = svgString.trim();

  // <?xml ...?> 태그나 <!DOCTYPE ...> 제거하여 표준 <svg> 루트 보장
  svg = svg.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();

  // xmlns 보장
  if (!svg.includes('xmlns=')) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // 아이폰 Safari/WebKit을 72 DPI 저해상도 소프트웨어 래스터라이저로 강제 다운그레이드시키는
  // feDisplacementMap, feTurbulence 필터(크레용 질감 등) 및 해당 필터 참조 속성 원천 제거
  svg = svg.replace(/<filter\b[^>]*>[\s\S]*?(?:feTurbulence|feDisplacementMap)[\s\S]*?<\/filter>/gi, '');
  svg = svg.replace(/\s*filter=["']url\(#[^"']*?(?:crayon|turb|displace)[^"']*?\)["']/gi, '');

  // viewBox 검출 및 보정
  const hasViewBox = /viewBox\s*=\s*["'][^"']+["']/i.test(svg);
  if (!hasViewBox) {
    const widthMatch = svg.match(/\bwidth\s*=\s*["']?([\d.]+)(?:px)?["']?/i);
    const heightMatch = svg.match(/\bheight\s*=\s*["']?([\d.]+)(?:px)?["']?/i);
    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      if (w > 0 && h > 0) {
        svg = svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
      }
    } else {
      svg = svg.replace(/<svg\b/i, '<svg viewBox="0 0 100 100"');
    }
  }

  // WebKit이 고정 작은 width/height (예: 24, 32, 48) 때문에 내부 래스터 버퍼를 작게 고정하는 것을 방지
  // svg 태그의 고정 픽셀 width/height를 제거하거나 100%로 변경
  svg = svg
    .replace(/(<svg\b[^>]*?)\s+width\s*=\s*["'][\d.]+(?:px)?["']/i, '$1 width="100%"')
    .replace(/(<svg\b[^>]*?)\s+height\s*=\s*["'][\d.]+(?:px)?["']/i, '$1 height="100%"');

  return svg;
}

/**
 * 이미지 파일(GIF/SVG/PNG 등)을 Data URL로 변환
 * (움직이는 GIF는 캔버스 변환 시 프레임이 손실되므로 원본 바이너리를 100% 보존,
 *  SVG는 텍스트 파싱을 거쳐 아이폰 Retina에서도 선명한 벡터 Data URL로 생성)
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

    // 1) SVG 파일: 텍스트로 읽어서 벡터 정규화(viewBox 보장, 작은 width/height 제거) 후 UTF-8 SVG Data URL로 반환
    if (isSvg) {
      const textReader = new FileReader();
      textReader.onload = () => {
        try {
          const rawText = String(textReader.result || '');
          const normalized = normalizeSvgContent(rawText);
          const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(normalized)}`;
          resolve(dataUrl);
        } catch (e) {
          // 텍스트 파싱 실패 시 표준 base64 SVG 폴백
          const binReader = new FileReader();
          binReader.onload = () => {
            let res = String(binReader.result || '');
            if (!res.startsWith('data:image/svg+xml')) {
              res = res.replace(/^data:[^;]*;/, 'data:image/svg+xml;');
            }
            resolve(res);
          };
          binReader.onerror = () => reject(binReader.error);
          binReader.readAsDataURL(file);
        }
      };
      textReader.onerror = () => reject(textReader.error);
      textReader.readAsText(file);
      return;
    }

    // 2) GIF 파일: 움직이는 애니메이션 보존을 위해 원본 바이너리 Data URL 반환
    if (isGif) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }

    // 3) 비트맵(PNG/JPG/WEBP)인 경우 스티커 최적 해상도(최대 320px)로 경량화하여 로컬스토리지 쿼터 초과 원천 방어
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const maxDim = 320;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * 10. 꾸미기 에셋(날씨/스티커/마스킹테이프/움직이는 GIF) Firebase Storage 업로드 및 Firestore decorations 컬렉션 저장
 * (Storage 버킷 미개설/CORS 차단 시 무한 대기하지 않고 즉시 Data URL 폴백으로 Firestore decorations에 저장)
 * @param {{ file: File, category: 'weather' | 'sticker' | 'tape' | 'gif', name?: string }} params
 */
export async function uploadDecorationAsset({ file, category, name }) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  if (!file) {
    throw new Error('업로드할 파일을 선택해 주세요.');
  }

  // 동적 카테고리 지원 (미지정 시 기본값 'sticker')
  const targetCategory = (category || '').trim() || 'sticker';

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  const docId = `deco_${timestamp}_${randomSuffix}`;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  let imageUrl = '';
  let storagePath = '';

  const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  const resolvedContentType = isSvg ? 'image/svg+xml' : (isGif ? 'image/gif' : (file.type || 'image/png'));

  // SVG 파일인 경우 사전에 벡터 정규화된 Blob으로 변환하여 Storage에 올림 (아이폰 Safari 고화질 보장)
  let uploadPayload = file;
  if (isSvg) {
    try {
      const rawSvg = await file.text();
      const normalizedSvg = normalizeSvgContent(rawSvg);
      uploadPayload = new Blob([normalizedSvg], { type: 'image/svg+xml' });
      uploadPayload.name = file.name;
    } catch {}
  }

  // 1) Firebase Storage가 가용한 경우 1.2초 타임아웃 내에 업로드 시도
  if (storage && isStorageBucketAvailable) {
    const candidatePath = `decorations/${targetCategory}/${timestamp}_${safeFileName}`;
    const fileRef = storageRef(storage, candidatePath);
    try {
      await withTimeout(
        uploadBytes(fileRef, uploadPayload, {
          contentType: resolvedContentType,
        }),
        1200,
        'STORAGE_UPLOAD_TIMEOUT'
      );
      imageUrl = await withTimeout(
        getDownloadURL(fileRef),
        1200,
        'STORAGE_URL_TIMEOUT'
      );
      storagePath = candidatePath;
    } catch (storageErr) {
      // Storage 버킷 미활성화(Spark 요금제 등) 또는 CORS 차단 시 이후 파일들은 대기 없이 즉시 폴백
      isStorageBucketAvailable = false;
      console.warn(
        '[Storage 폴백] Firebase Storage 응답 지연/미설정으로 인해 이미지를 직접 Firestore decorations에 저장합니다:',
        storageErr?.message || storageErr
      );
    }
  }

  // 2) Storage 미사용/폴백 시 SVG/PNG/GIF Data URL로 즉시 변환 (GIF 애니메이션 및 SVG 벡터 100% 보존)
  if (!imageUrl) {
    imageUrl = await fileToDataUrl(file);
    storagePath = '';
  }

  // 3) 메타데이터 구성
  const defaultLabel = file.name.replace(/\.[^/.]+$/, '');
  const itemRecord = {
    id: docId,
    category: targetCategory,
    imageUrl,
    name: (name && name.trim()) || defaultLabel,
    fileName: file.name,
    contentType: resolvedContentType,
    isGif,
    storagePath,
    createdAtMs: timestamp,
  };

  // 로컬 캐시 즉시 반영
  const existingLocal = readLocalDecorations().filter((d) => d.id !== docId);
  writeLocalDecorations([itemRecord, ...existingLocal]);

  // 4) Firestore decorations 컬렉션 저장 (권한 규칙 대비 사용자 하위 컬렉션과 병렬 처리)
  const payload = {
    ...itemRecord,
    createdAt: serverTimestamp(),
  };

  const firestoreTasks = [
    withTimeout(
      setDoc(doc(db, 'decorations', docId), payload),
      2000,
      'FIRESTORE_WRITE_TIMEOUT'
    ),
  ];

  if (auth?.currentUser?.uid) {
    firestoreTasks.push(
      withTimeout(
        setDoc(
          doc(db, 'users', auth.currentUser.uid, 'decorations', docId),
          payload
        ),
        2000,
        'FIRESTORE_USER_WRITE_TIMEOUT'
      )
    );
  }

  await Promise.allSettled(firestoreTasks);

  return itemRecord;
}

/**
 * 11. Firestore decorations 컬렉션 실시간 구독
 * (어드민에서 삭제된 스티커가 로컬 캐시로 인해 영구 부활하던 버그 원천 차단 및 deleted_decorations 묘비 연동)
 * @param {(items: Array<any>) => void} onUpdate
 * @param {(error: any) => void} [onError]
 */
export function subscribeToDecorations(onUpdate, onError) {
  let cloudDocsMap = new Map();
  let userDocsMap = new Map();
  let cachedDeletedDecoIds = new Set();

  const emitMerged = () => {
    const mergedMap = new Map();

    // 1) Firestore 응답 전이거나 오프라인일 때만 로컬 캐시를 초기 표시용으로 활용
    if (cloudDocsMap.size === 0) {
      readLocalDecorations().forEach((item) => {
        if (item?.id && !cachedDeletedDecoIds.has(String(item.id))) {
          mergedMap.set(String(item.id), item);
        }
      });
    }

    // 2) 사용자 하위 폴백 컬렉션 (삭제된 ID 제외)
    userDocsMap.forEach((item, id) => {
      if (!cachedDeletedDecoIds.has(String(id))) {
        mergedMap.set(String(id), item);
      }
    });

    // 3) 공용 decorations 컬렉션 (단일 진실 원천)
    cloudDocsMap.forEach((item, id) => {
      if (!cachedDeletedDecoIds.has(String(id))) {
        mergedMap.set(String(id), item);
      }
    });

    const items = Array.from(mergedMap.values());
    items.sort((a, b) => {
      const timeA = a.createdAtMs || a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAtMs || b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });

    onUpdate(items);
  };

  // 초기 즉시 전달
  emitMerged();
  localDecorationListeners.add(emitMerged);

  if (!isFirebaseConfigured || !db) {
    return () => {
      localDecorationListeners.delete(emitMerged);
    };
  }

  // 삭제된 스티커 묘비(tombstones) 실시간 구독
  let unsubDeleted = () => {};
  try {
    const deletedDecoRef = collection(db, 'deleted_decorations');
    unsubDeleted = onSnapshot(
      deletedDecoRef,
      (snap) => {
        cachedDeletedDecoIds = new Set(snap.docs.map((d) => d.id));
        // 로컬 캐시에서도 삭제된 스티커 즉각 정리
        const currentLocal = readLocalDecorations();
        const filteredLocal = currentLocal.filter((d) => !cachedDeletedDecoIds.has(String(d.id)));
        if (filteredLocal.length !== currentLocal.length) {
          writeLocalDecorations(filteredLocal);
        }
        emitMerged();
      },
      () => {}
    );
  } catch {}

  const decorationsRef = collection(db, 'decorations');
  const unsubGlobal = onSnapshot(
    decorationsRef,
    (snapshot) => {
      cloudDocsMap = new Map();
      snapshot.docs.forEach((docSnap) => {
        if (cachedDeletedDecoIds.has(docSnap.id)) {
          // 혹시 원격에 남아있는 삭제 묘비 문서는 정리
          deleteDoc(doc(db, 'decorations', docSnap.id)).catch(() => {});
          return;
        }
        cloudDocsMap.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data(),
        });
      });

      // 클라우드 데이터가 수신되면, 로컬 캐시를 클라우드 최신 목록으로 '완전 동기화(교체)'
      // (삭제된 로컬 아이템을 도로 합쳐서 되살리지 않음!)
      const currentCloudList = Array.from(cloudDocsMap.values());
      try {
        localStorage.setItem(LOCAL_DECORATIONS_KEY, JSON.stringify(currentCloudList));
      } catch {}

      emitMerged();
    },
    (error) => {
      console.warn('[Firestore] decorations 구독 경고(폴백 동작 중):', error?.message || error);
      emitMerged();
      if (onError) onError(error);
    }
  );

  let unsubUser = () => {};
  const subscribeUserFallback = (uid) => {
    unsubUser();
    if (!uid) {
      userDocsMap = new Map();
      emitMerged();
      return;
    }
    const userDecoRef = collection(db, 'users', uid, 'decorations');
    unsubUser = onSnapshot(
      userDecoRef,
      (snap) => {
        userDocsMap = new Map();
        snap.docs.forEach((d) => {
          if (!cachedDeletedDecoIds.has(d.id)) {
            userDocsMap.set(d.id, { id: d.id, ...d.data() });
          }
        });
        emitMerged();
      },
      () => {}
    );
  };

  const unsubAuth = auth
    ? onAuthStateChanged(auth, (u) => subscribeUserFallback(u?.uid))
    : () => {};

  return () => {
    localDecorationListeners.delete(emitMerged);
    unsubDeleted();
    unsubGlobal();
    unsubUser();
    unsubAuth();
  };
}

/**
 * 11-1. 절전 복귀 시 decorations 최신 에셋 단발성 초고속 직접 동기화
 */
export async function fetchDecorationsOnce() {
  if (!isFirebaseConfigured || !db) return [];
  try {
    const [snap, deletedSnap] = await Promise.all([
      getDocs(collection(db, 'decorations')),
      getDocs(collection(db, 'deleted_decorations')).catch(() => ({ docs: [] })),
    ]);
    const deletedIds = new Set(deletedSnap.docs.map((d) => d.id));
    const items = [];
    snap.docs.forEach((d) => {
      if (!deletedIds.has(d.id)) {
        items.push({ id: d.id, ...d.data() });
      }
    });
    try {
      localStorage.setItem(LOCAL_DECORATIONS_KEY, JSON.stringify(items));
    } catch {}
    localDecorationListeners.forEach((fn) => {
      try { fn(); } catch {}
    });
    return items;
  } catch (err) {
    return [];
  }
}

/**
 * 12. 꾸미기 에셋 삭제 (Firestore decorations 문서 삭제 + deleted_decorations 묘비 등록 + Storage 원본 이미지 삭제)
 * @param {{ id: string, storagePath?: string }} decoration
 */
export async function deleteDecorationAsset(decoration) {
  if (!decoration?.id) return;
  const idStr = String(decoration.id);

  // 1) 로컬 캐시에서 즉시 제거
  const nextLocal = readLocalDecorations().filter((d) => String(d.id) !== idStr);
  writeLocalDecorations(nextLocal);

  // 로컬 analog_my_stickers 보관소에서도 삭제
  try {
    const rawMy = localStorage.getItem('analog_my_stickers');
    if (rawMy) {
      const list = JSON.parse(rawMy);
      if (Array.isArray(list)) {
        const cleaned = list.filter((s) => String(s.id) !== idStr && String(s.decorationId) !== idStr);
        localStorage.setItem('analog_my_stickers', JSON.stringify(cleaned));
      }
    }
  } catch {}

  if (!isFirebaseConfigured || !db) return;

  // 2) 다른 모든 기기에서 해당 스티커가 부활하지 못하도록 영구 묘비(tombstone) 등록
  try {
    const tombstoneRef = doc(db, 'deleted_decorations', idStr);
    await setDoc(tombstoneRef, {
      id: idStr,
      deletedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firestore] deleted_decorations tombstone 등록 오류:', err);
  }

  // 3) Firestore decorations 공용 컬렉션 문서 삭제
  try {
    await withTimeout(
      deleteDoc(doc(db, 'decorations', idStr)),
      2500,
      'FIRESTORE_DELETE_TIMEOUT'
    );
  } catch (err) {
    console.warn('[Firestore] decorations 삭제 경고:', err);
  }

  // 4) 사용자 하위 컬렉션 삭제
  if (auth?.currentUser?.uid) {
    try {
      await withTimeout(
        deleteDoc(doc(db, 'users', auth.currentUser.uid, 'decorations', idStr)),
        2000,
        'FIRESTORE_USER_DELETE_TIMEOUT'
      );
    } catch {}
  }

  // 5) Storage 파일 삭제 (경로가 있고 Storage가 활성화된 경우)
  if (storage && isStorageBucketAvailable && decoration.storagePath) {
    try {
      const fileRef = storageRef(storage, decoration.storagePath);
      await withTimeout(deleteObject(fileRef), 1500, 'STORAGE_DELETE_TIMEOUT');
    } catch (err) {
      console.warn('[Storage] 원본 파일 삭제 중 무시된 오류:', err);
    }
  }
}

/**
 * 12-1. 복수 꾸미기 에셋 일괄 삭제 (Firestore batch + deleted_decorations tombstone + Storage 파일 일괄 삭제)
 * @param {Array<{ id: string, storagePath?: string }>} items
 */
export async function deleteMultipleDecorationAssets(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const idSet = new Set(items.map((it) => String(it.id)));

  // 1) 로컬 캐시 즉시 일괄 제거
  const nextLocal = readLocalDecorations().filter((d) => !idSet.has(String(d.id)));
  writeLocalDecorations(nextLocal);

  try {
    const rawMy = localStorage.getItem('analog_my_stickers');
    if (rawMy) {
      const list = JSON.parse(rawMy);
      if (Array.isArray(list)) {
        const cleaned = list.filter(
          (s) => !idSet.has(String(s.id)) && !idSet.has(String(s.decorationId))
        );
        localStorage.setItem('analog_my_stickers', JSON.stringify(cleaned));
      }
    }
  } catch {}

  if (!isFirebaseConfigured || !db) return;

  // 2) Firestore batch 일괄 삭제 및 tombstone 등록
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      const idStr = String(item.id);
      batch.delete(doc(db, 'decorations', idStr));
      batch.set(doc(db, 'deleted_decorations', idStr), {
        id: idStr,
        deletedAt: serverTimestamp(),
      });
      if (auth?.currentUser?.uid) {
        batch.delete(doc(db, 'users', auth.currentUser.uid, 'decorations', idStr));
      }
    });
    await withTimeout(batch.commit(), 5000, 'FIRESTORE_BATCH_DELETE_TIMEOUT');
  } catch (err) {
    console.warn('[Firestore] 일괄 삭제 경고:', err);
  }

  // 3) Storage 파일 일괄 삭제
  if (storage && isStorageBucketAvailable) {
    const deleteTasks = items
      .filter((it) => it.storagePath)
      .map((it) => {
        const fileRef = storageRef(storage, it.storagePath);
        return withTimeout(deleteObject(fileRef), 1500, 'STORAGE_DELETE_TIMEOUT').catch(() => {});
      });
    await Promise.allSettled(deleteTasks);
  }
}

/**
 * 13. 꾸미기 에셋 메타데이터 수정 (이름, 카테고리 등)
 * @param {string} id
 * @param {{ name?: string, category?: 'weather' | 'sticker' | 'tape' }} fields
 */
export async function updateDecorationAsset(id, fields) {
  if (!id) return;
  const idStr = String(id);

  // 로컬 캐시 즉시 수정
  const updatedLocal = readLocalDecorations().map((d) =>
    String(d.id) === idStr ? { ...d, ...fields } : d
  );
  writeLocalDecorations(updatedLocal);

  if (!isFirebaseConfigured || !db) return;

  try {
    await withTimeout(
      setDoc(
        doc(db, 'decorations', idStr),
        {
          ...fields,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      2500,
      'FIRESTORE_UPDATE_TIMEOUT'
    );
  } catch (err) {
    console.warn('[Firestore] decorations 수정 경고:', err);
  }

  if (auth?.currentUser?.uid) {
    try {
      await withTimeout(
        setDoc(
          doc(db, 'users', auth.currentUser.uid, 'decorations', idStr),
          {
            ...fields,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        2000,
        'FIRESTORE_USER_UPDATE_TIMEOUT'
      );
    } catch {}
  }
}

/**
 * 14. 카테고리 관리 기능 (고정 카테고리 + 추가/삭제 가능한 스티커 하위 카테고리)
 */
export const FIXED_CATEGORIES = [
  { id: 'emotion', label: '표정', isFixed: true },
  { id: 'weather', label: '날씨', isFixed: true },
  { id: 'anniversary', label: '기념일', isFixed: true },
];
export const FIXED_CATEGORY_IDS = new Set(['emotion', 'weather', 'anniversary']);

export const DEFAULT_CUSTOM_CATEGORIES = [
  { id: 'sticker', label: '스티커', order: 1 },
  { id: 'character', label: '캐릭터', order: 2 },
  { id: 'daily', label: '일상', order: 3 },
  { id: 'food', label: '음식', order: 4 },
  { id: 'tape', label: '마스킹테이프', order: 5 },
];
export const DEFAULT_CATEGORIES = DEFAULT_CUSTOM_CATEGORIES;

const LOCAL_CATEGORIES_KEY = 'analog_diary_categories';
const localCategoryListeners = new Set();

export function readLocalCategories() {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function writeLocalCategories(categories) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (err) {
    console.warn('[LocalStorage] 카테고리 캐시 저장 실패:', err);
  }
  localCategoryListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

/**
 * Firestore categories 컬렉션 실시간 구독
 * @param {(categories: Array<{ id: string, label: string, order?: number }>) => void} onUpdate
 * @param {(error: any) => void} [onError]
 */
export function subscribeToCategories(onUpdate, onError) {
  let cloudCategories = null;

  const emit = () => {
    if (cloudCategories && cloudCategories.length > 0) {
      onUpdate(cloudCategories);
    } else {
      const local = readLocalCategories();
      onUpdate(local);
    }
  };

  // 1) 초기 즉시 로컬 캐시 전달
  emit();
  localCategoryListeners.add(emit);

  if (!isFirebaseConfigured || !db) {
    return () => {
      localCategoryListeners.delete(emit);
    };
  }

  // 2) Firestore categories 컬렉션 실시간 구독
  const categoriesRef = collection(db, 'categories');
  const unsubCloud = onSnapshot(
    categoriesRef,
    (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        // order 또는 생성순 정렬
        list.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 999;
          const orderB = typeof b.order === 'number' ? b.order : 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.createdAtMs || 0) - (b.createdAtMs || 0);
        });
        cloudCategories = list;
        writeLocalCategories(list);
      } else {
        // Firestore에 카테고리가 아직 하나도 없을 경우 기본값 전달
        cloudCategories = null;
      }
      emit();
    },
    (error) => {
      console.warn('[Firestore] categories 구독 경고(폴백 작동):', error?.message || error);
      emit();
      if (onError) onError(error);
    }
  );

  return () => {
    localCategoryListeners.delete(emit);
    unsubCloud();
  };
}

/**
 * 카테고리가 Firestore에 비어있을 경우 기본 카테고리를 시딩
 */
export async function seedDefaultCategoriesIfNeeded() {
  if (!isFirebaseConfigured || !db) return;
  try {
    const snap = await withTimeout(getDocs(collection(db, 'categories')), 3000, 'GET_CATEGORIES_TIMEOUT');
    if (snap.empty) {
      console.log('[Firestore] categories 컬렉션이 비어있어 기본 카테고리를 등록합니다.');
      for (const cat of DEFAULT_CATEGORIES) {
        await setDoc(doc(db, 'categories', cat.id), {
          label: cat.label,
          order: cat.order,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn('[Firestore] 기본 카테고리 시딩 오류/경고:', err);
  }
}

/**
 * 새 카테고리 추가
 * @param {{ id: string, label: string, order?: number }} category
 */
export async function addCategory({ id, label, order }) {
  const cleanLabel = (label || '').trim();
  let cleanId = (id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (!cleanId) {
    cleanId = `cat_${Date.now()}`;
  }
  if (!cleanLabel) {
    throw new Error('카테고리 이름을 입력해 주세요.');
  }
  if (FIXED_CATEGORY_IDS.has(cleanId)) {
    throw new Error(`'${cleanId}'는 시스템 고정 카테고리로 예약되어 있습니다.`);
  }

  const currentLocal = readLocalCategories();
  if (currentLocal.some((c) => c.id === cleanId)) {
    throw new Error(`이미 존재하는 카테고리 ID (${cleanId}) 입니다.`);
  }

  const nextOrder = typeof order === 'number' ? order : currentLocal.length + 1;
  const newCat = {
    id: cleanId,
    label: cleanLabel,
    order: nextOrder,
    createdAtMs: Date.now(),
  };

  const nextList = [...currentLocal, newCat];
  writeLocalCategories(nextList);

  if (isFirebaseConfigured && db) {
    try {
      await withTimeout(
        setDoc(doc(db, 'categories', cleanId), {
          label: cleanLabel,
          order: nextOrder,
          createdAt: serverTimestamp(),
          createdAtMs: Date.now(),
        }),
        3000,
        'FIRESTORE_ADD_CATEGORY_TIMEOUT'
      );
    } catch (err) {
      console.warn('[Firestore] 카테고리 추가 경고:', err);
    }
  }

  return newCat;
}

/**
 * 카테고리 삭제
 * @param {string} categoryId
 */
export async function deleteCategory(categoryId) {
  if (!categoryId) return;
  const targetId = String(categoryId);
  if (FIXED_CATEGORY_IDS.has(targetId)) {
    throw new Error('시스템 고정 카테고리는 삭제할 수 없습니다.');
  }

  const currentLocal = readLocalCategories();
  const nextList = currentLocal.filter((c) => c.id !== targetId);
  writeLocalCategories(nextList);

  if (isFirebaseConfigured && db) {
    try {
      await withTimeout(
        deleteDoc(doc(db, 'categories', targetId)),
        3000,
        'FIRESTORE_DELETE_CATEGORY_TIMEOUT'
      );
    } catch (err) {
      console.warn('[Firestore] 카테고리 삭제 경고:', err);
    }
  }
}

/**
 * 카테고리 순서 일괄 갱신
 * @param {Array<{ id: string, label: string, order?: number }>} reorderedList
 */
export async function updateCategoriesOrder(reorderedList) {
  if (!Array.isArray(reorderedList)) return [];

  const updatedList = reorderedList.map((cat, idx) => ({
    ...cat,
    order: idx + 1,
  }));

  // 1) 로컬 캐시 즉시 업데이트
  writeLocalCategories(updatedList);

  // 2) Firestore 일괄 업데이트
  if (isFirebaseConfigured && db) {
    try {
      const batch = writeBatch(db);
      updatedList.forEach((cat) => {
        const catRef = doc(db, 'categories', cat.id);
        batch.set(
          catRef,
          {
            label: cat.label,
            order: cat.order,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await withTimeout(batch.commit(), 3500, 'BATCH_UPDATE_CATEGORIES_TIMEOUT');
    } catch (err) {
      console.warn('[Firestore] 카테고리 순서 업데이트 경고:', err);
    }
  }

  return updatedList;
}

