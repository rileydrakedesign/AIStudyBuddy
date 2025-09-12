import axios from "axios";

axios.defaults.withCredentials = true;

export const loginUser = async (email: string, password: string) => {
  const res = await axios.post("/user/login", { email, password });
  if (res.status !== 200) {
    throw new Error("Unable to login");
  }
  const data = await res.data;
  return data;
};

export const loginWithGoogle = async (credential: string) => {
  try {
    const res = await axios.post("/user/google", { credential });
    if (res.status !== 200) {
      throw new Error("Unable to login with Google");
    }
    return res.data;
  } catch (err: any) {
    // Surface details to the caller for debugging
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("[Google] loginWithGoogle error", { status, data, baseURL: axios.defaults.baseURL });
    throw err;
  }
};

export interface SignupPayload {
  firstName: string;
  lastName:  string;
  school?:   string;
  email:     string;
  password:  string;
  confirmPassword: string;
}

export const signupUser = async (payload: SignupPayload) => {
  const res = await axios.post("/user/signup", payload, { withCredentials: true });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error("Unable to sign up");
  }
  return res.data;
};


export const checkAuthStatus = async () => {
  const res = await axios.get("/user/auth-status");
  if (res.status !== 200) {
    throw new Error("Unable to authenticate");
  }
  const data = await res.data;
  return data;
};

export const sendChatRequest = async (
  message: string,
  selectedClass: string | null,
  chatSessionId: string | null,
  docId?: string | null,
  ephemeral?: boolean,
  retry?: boolean
) => {
  const body: any = {
    message,
    class_name: selectedClass,
    chatSessionId,
  };

  if (docId) {
    body.docId = docId;
  }

  if (ephemeral) {
    body.ephemeral = true;
  }

  if (retry) {
    body.retry = true; 
  }


  const res = await axios.post("/chat/new", body);
  if (res.status !== 200) {
    throw new Error("Unable to send chat");
  }
  return res.data;
};

export const getUserChatSessions = async () => {
  const res = await axios.get("/chat/sessions");
  if (res.status !== 200) {
    throw new Error("Unable to fetch chat sessions");
  }
  return res.data; // Should return { chatSessions }
};

export const createChatSession = async (name: string) => {
  const res = await axios.post("/chat/new-session", { name });
  if (res.status !== 201) {
    throw new Error("Unable to create chat session");
  }
  return res.data; // Should return { chatSession }
};

export const deleteChatSession = async (chatSessionId: string) => {
  const res = await axios.delete(`/chat/session/${chatSessionId}`);
  if (res.status !== 200) {
    throw new Error("Unable to delete chat session");
  }
  return res.data;
};

export const deleteAllChatSessions = async () => {
  const res = await axios.delete("/chat/sessions");
  if (res.status !== 200) {
    throw new Error("Unable to delete all chat sessions");
  }
  return res.data;
};

export const logoutUser = async () => {
  const res = await axios.get("/user/logout");
  if (res.status !== 200) {
    throw new Error("Unable to delete chats");
  }
  const data = await res.data;
  return data;
};

export const uploadDocument = async (formData: FormData) => {
  const response = await axios.post("/documents/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getUserClasses = async () => {
  const res = await axios.get("/user/classes");
  if (res.status !== 200) {
    throw new Error("Unable to fetch user classes");
  }
  const data = await res.data;
  return data; // Should return an array of class objects (id and name)
};

export const getClassDocuments = async (className: string) => {
  const cleanedClassName = encodeURIComponent(className.trim());
  const res = await axios.get(`/documents/get/${cleanedClassName}`);
  if (res.status !== 200) {
    throw new Error("Unable to fetch documents for class " + className);
  }
  return res.data; // Returns an array of document objects
};

export const getDocumentFile = async (docId: string) => {
  const res = await axios.get(`/documents/${docId}/file`);
  if (res.status !== 200) {
    throw new Error("Unable to fetch doc file");
  }
  return res.data; // { url: string }
};

export const deleteClass = async (classId: string) => {
  const res = await axios.delete(`/user/classes/${classId}`);
  if (res.status !== 200) {
    throw new Error("Unable to delete class");
  }
  return res.data; // e.g. { message: "Class deleted" }
};

export const deleteDocument = async (docId: string) => {
  const res = await axios.delete(`/documents/delete/${docId}`);
  if (res.status !== 200) {
    throw new Error("Unable to delete document");
  }
  return res.data; // e.g. { message: "Document deleted" }
};

/**
 * Fetches text for a specific chunk via GET /chat/chunk/:chunkId
 */
export const getChunkText = async (chunkId: string) => {
  const res = await axios.get(`/chat/chunk/${chunkId}`);
  if (res.status !== 200) {
    throw new Error("Unable to fetch chunk text");
  }
  return res.data; // e.g. { text, pageNumber, fileName, docId, classId, ... }
};

/**
 * Fetches the current user's profile information.
 */
export const getUserProfile = async () => {
  const res = await axios.get("/profile");
  if (res.status !== 200) {
    throw new Error("Unable to fetch profile");
  }
  return res.data; // Expected response: { message: "OK", profile: { fullName, email, plan } }
};

// api-communicators.ts
export const verifyUser = async () => {
  // use the same base path as the other user endpoints
  const res = await axios.get("/user/auth-status");
  if (res.status !== 200) throw new Error("Unable to verify");
  return res.data;   // { plan, chatRequestCount, ... }
};


// helpers/api-communicators.ts
export const getUserDocuments = async () => {
  const res = await axios.get("/documents/all-documents");   
  if (res.status !== 200) throw new Error("Unable to fetch documents");
  return res.data;                                           // { documents: [...] }
};

export const setReaction = async (
  sessionId: string,
  msgIndex: number,
  reaction: "like" | "dislike" | null
) => {
  const res = await axios.patch(
    `/chat/message/${sessionId}/${msgIndex}/reaction`,
    { reaction }
  );
  if (res.status !== 200) throw new Error("Failed to set reaction");
  return res.data.reaction;   // just echo
};

export const resendConfirmation = async (email: string) => {
  const res = await axios.post("/user/resend-confirmation", { email });
  if (res.status !== 200) throw new Error("Failed to resend");
  return res.data;
};
