import axios from "axios";


export const loginUser = async (email: string, password: string) => {
  const res = await axios.post("/user/login", { email, password });
  if (res.status !== 200) {
    throw new Error("Unable to login");
  }
  const data = await res.data;
  return data;
};

export const signupUser = async (
  name: string,
  email: string,
  password: string
) => {
  const res = await axios.post("/user/signup", { name, email, password });
  if (res.status !== 201) {
    throw new Error("Unable to Signup");
  }
  const data = await res.data;
  return data;
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
  chatSessionId: string | null
) => {
  const res = await axios.post("/chat/new", {
    message,
    class_name: selectedClass,
    chatSessionId,
  });
  if (res.status !== 200) {
    throw new Error("Unable to send chat");
  }
  return res.data; // Should return { chatSessionId, messages }
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
  // Trim any extra spaces and encode the class name to handle spaces
  const cleanedClassName = encodeURIComponent(className.trim());
  const res = await axios.get(`/documents/get/${cleanedClassName}`);
  if (res.status !== 200) {
    throw new Error("Unable to fetch documents for class " + className);
  }
  return res.data; // Returns an array of document objects
};
