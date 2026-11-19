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
 * 3. 인증 상태 변화 구독
 * @param {(user: import('firebase/auth').User | null) => void} callback
 */
export function subscribeToAuthChanges(callback) {
  if (!isFirebaseConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
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
  return onSnapshot(
    diariesRef,
    async (snapshot) => {
      // 멀티 디바이스 간 삭제된 항목 부활 방지: deleted_ids 목록 조회
      let deletedIds = new Set();
      try {
        const deletedSnap = await getDocs(collection(db, 'users', uid, 'deleted_ids'));
        deletedIds = new Set(deletedSnap.docs.map((d) => d.id));
      } catch (err) {}

      const cloudDiaries = [];
      snapshot.docs.forEach((docSnap) => {
        if (LEGACY_SAMPLE_IDS.has(docSnap.id) || deletedIds.has(docSnap.id)) {
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
 * 이미지 파일(GIF/SVG/PNG 등)을 Data URL로 변환
 * (움직이는 GIF는 캔버스 변환 시 프레임이 손실되므로 원본 바이너리를 100% 보존)
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      
      // 움직이는 GIF는 캔버스 drawImage 거치면 정지 화상이 되므로 반드시 원본 Data URL 그대로 반환
      // SVG 및 400KB 이하 소용량 이미지도 원본 그대로 반환
      if (isGif || isSvg || file.size <= 400 * 1024) {
        resolve(dataUrl);
        return;
      }

      // 고용량 비트맵(PNG/JPG)인 경우 Firestore 문서 제한 내에 들어오도록 리사이징
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
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
  const validCategories = ['weather', 'sticker', 'tape', 'gif'];
  if (!validCategories.includes(category)) {
    throw new Error('유효하지 않은 카테고리입니다.');
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  const docId = `deco_${timestamp}_${randomSuffix}`;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  let imageUrl = '';
  let storagePath = '';

  const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  const resolvedContentType = file.type || (isGif ? 'image/gif' : 'image/png');

  // 1) Firebase Storage가 가용한 경우 1.2초 타임아웃 내에 업로드 시도
  if (storage && isStorageBucketAvailable) {
    const candidatePath = `decorations/${category}/${timestamp}_${safeFileName}`;
    const fileRef = storageRef(storage, candidatePath);
    try {
      await withTimeout(
        uploadBytes(fileRef, file, {
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

  // 2) Storage 미사용/폴백 시 SVG/PNG/GIF Data URL로 즉시 변환 (GIF 애니메이션 100% 보존)
  if (!imageUrl) {
    imageUrl = await fileToDataUrl(file);
    storagePath = '';
  }

  // 3) 메타데이터 구성
  const defaultLabel = file.name.replace(/\.[^/.]+$/, '');
  const itemRecord = {
    id: docId,
    category, // 'weather' | 'sticker' | 'tape' | 'gif'
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
 * @param {(items: Array<any>) => void} onUpdate
 * @param {(error: any) => void} [onError]
 */
export function subscribeToDecorations(onUpdate, onError) {
  let cloudDocsMap = new Map();
  let userDocsMap = new Map();

  const emitMerged = () => {
    const mergedMap = new Map();
    // 1) 로컬 캐시
    readLocalDecorations().forEach((item) => {
      if (item?.id) mergedMap.set(item.id, item);
    });
    // 2) 사용자 하위 폴백 컬렉션
    userDocsMap.forEach((item, id) => {
      mergedMap.set(id, item);
    });
    // 3) 공용 decorations 컬렉션 우선
    cloudDocsMap.forEach((item, id) => {
      mergedMap.set(id, item);
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

  const decorationsRef = collection(db, 'decorations');
  const unsubGlobal = onSnapshot(
    decorationsRef,
    (snapshot) => {
      cloudDocsMap = new Map();
      snapshot.docs.forEach((docSnap) => {
        cloudDocsMap.set(docSnap.id, {
          id: docSnap.id,
          ...docSnap.data(),
        });
      });
      // 클라우드 데이터가 있으면 로컬 캐시도 최신화
      if (cloudDocsMap.size > 0) {
        const mergedForCache = new Map();
        readLocalDecorations().forEach((d) => mergedForCache.set(d.id, d));
        cloudDocsMap.forEach((v, k) => mergedForCache.set(k, v));
        try {
          localStorage.setItem(
            LOCAL_DECORATIONS_KEY,
            JSON.stringify(Array.from(mergedForCache.values()))
          );
        } catch {}
      }
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
          userDocsMap.set(d.id, { id: d.id, ...d.data() });
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
    unsubGlobal();
    unsubUser();
    unsubAuth();
  };
}

/**
 * 12. 꾸미기 에셋 삭제 (Firestore decorations 문서 삭제 + Firebase Storage 원본 이미지 삭제)
 * @param {{ id: string, storagePath?: string }} decoration
 */
export async function deleteDecorationAsset(decoration) {
  if (!decoration?.id) return;
  const idStr = String(decoration.id);

  // 로컬 캐시에서 즉시 제거
  const nextLocal = readLocalDecorations().filter((d) => String(d.id) !== idStr);
  writeLocalDecorations(nextLocal);

  if (!isFirebaseConfigured || !db) return;

  // 1) Firestore 문서 삭제
  try {
    await withTimeout(
      deleteDoc(doc(db, 'decorations', idStr)),
      2500,
      'FIRESTORE_DELETE_TIMEOUT'
    );
  } catch (err) {
    console.warn('[Firestore] decorations 삭제 경고:', err);
  }

  if (auth?.currentUser?.uid) {
    try {
      await withTimeout(
        deleteDoc(doc(db, 'users', auth.currentUser.uid, 'decorations', idStr)),
        2000,
        'FIRESTORE_USER_DELETE_TIMEOUT'
      );
    } catch {}
  }

  // 2) Storage 파일 삭제 (경로가 있고 Storage가 활성화된 경우)
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
