api-communicators.ts:94 
 POST https://localhost:3000/api/v1/chat/new 500 (Internal Server Error)
sendChatRequest	@	api-communicators.ts:94
handleSubmit	@	Chat.tsx:477
handleKeyDown	@	Chat.tsx:435

Chat.tsx:590 Error in handleSubmit: 
AxiosError {message: 'Request failed with status code 500', name: 'AxiosError', code: 'ERR_BAD_RESPONSE', config: {…}, request: XMLHttpRequest, …}
code
: 
"ERR_BAD_RESPONSE"
config
: 
{transitional: {…}, adapter: Array(3), transformRequest: Array(1), transformResponse: Array(1), timeout: 0, …}
message
: 
"Request failed with status code 500"
name
: 
"AxiosError"
request
: 
XMLHttpRequest {onreadystatechange: null, readyState: 4, timeout: 0, withCredentials: true, upload: XMLHttpRequestUpload, …}
response
: 
{data: {…}, status: 500, statusText: 'Internal Server Error', headers: AxiosHeaders, config: {…}, …}
status
: 
500
stack
: 
"AxiosError: Request failed with status code 500\n    at settle (https://localhost:5173/node_modules/.vite/deps/axios.js?v=29b63960:1229:12)\n    at XMLHttpRequest.onloadend (https://localhost:5173/node_modules/.vite/deps/axios.js?v=29b63960:1561:7)\n    at Axios.request (https://localhost:5173/node_modules/.vite/deps/axios.js?v=29b63960:2119:41)\n    at async sendChatRequest (https://localhost:5173/src/helpers/api-communicators.ts:67:17)\n    at async handleSubmit (https://localhost:5173/src/pages/Chat.tsx:390:30)"
[[Prototype]]
: 
Error
handleSubmit	@	Chat.tsx:590
await in handleSubmit		
handleKeyDown	@	Chat.tsx:435
