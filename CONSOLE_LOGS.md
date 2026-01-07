2026-01-07T05:54:38.896982+00:00 app[web.1]: {"level":30,"time":"2026-01-07T05:54:38.895Z","service":"class-chat-node","environment":"production","req":{"id":"056d33d0-5494-4a64-b773-c59cab35da05","method":"POST","url":"/api/v1/chat/new","query":{},"params":{},"headers":{"host":"class-chat-node-8a0ef9662b5a.herokuapp.com","user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36","content-length":"140","accept":"application/json, text/plain, */*","accept-encoding":"gzip, deflate, br, zstd","accept-language":"en-US,en;q=0.9","content-type":"application/json","cookie":"auth_token=s%3AeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MGU1MWY1YTRkYzI5NDA1NmQ4MzFhNyIsImVtYWlsIjoicmlsZXlkcmFrZWRlc2lnbkBnbWFpbC5jb20iLCJpYXQiOjE3Njc1ODU4MTAsImV4cCI6MTc2ODE5MDYxMH0.9ZGhHhIczLB-_HuBUubT1d39xG3g240ik9cYsmu5Wxs.CIBUPJe1wCtRV6%2F48qWv7oFC8MMgSC8pnoyLZoqhzsk","origin":"https://app.classchatai.com","referer":"https://app.classchatai.com/","sec-ch-ua":"\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"","sec-ch-ua-mobile":"?0","sec-ch-ua-platform":"\"macOS\"","sec-fetch-dest":"empty","sec-fetch-mode":"cors","sec-fetch-site":"cross-site","sec-fetch-storage-access":"active","server":"Heroku","via":"1.1 heroku-router","x-forwarded-for":"99.116.250.14","x-forwarded-port":"443","x-forwarded-proto":"https","x-request-id":"dec23895-4db6-2e4d-5b87-64ad719d39e1","x-request-start":"1767765263188"},"remoteAddress":"::ffff:10.1.82.94","remotePort":54866},"userId":"690e51f5a4dc294056d831a7","streamError":null,"hasCitations":true,"msg":"Python stream ended"}
2026-01-07T05:54:39.038223+00:00 app[web.1]: /app/node_modules/mongoose/lib/document.js:3219
2026-01-07T05:54:39.038225+00:00 app[web.1]: this.$__.validationError = new ValidationError(this);
2026-01-07T05:54:39.038226+00:00 app[web.1]: ^
2026-01-07T05:54:39.038226+00:00 app[web.1]: 
2026-01-07T05:54:39.038236+00:00 app[web.1]: ValidationError: ChatSession validation failed: messages.1.content: Path `content` is required.
2026-01-07T05:54:39.038237+00:00 app[web.1]: at Document.invalidate (/app/node_modules/mongoose/lib/document.js:3219:32)
2026-01-07T05:54:39.038237+00:00 app[web.1]: at Subdocument.invalidate (/app/node_modules/mongoose/lib/types/subdocument.js:229:12)
2026-01-07T05:54:39.038237+00:00 app[web.1]: at /app/node_modules/mongoose/lib/document.js:3012:17
2026-01-07T05:54:39.038238+00:00 app[web.1]: at /app/node_modules/mongoose/lib/schematype.js:1368:9
2026-01-07T05:54:39.038238+00:00 app[web.1]: at process.processTicksAndRejections (node:internal/process/task_queues:77:11) {
2026-01-07T05:54:39.038238+00:00 app[web.1]: errors: {
2026-01-07T05:54:39.038238+00:00 app[web.1]: 'messages.1.content': ValidatorError: Path `content` is required.
2026-01-07T05:54:39.038239+00:00 app[web.1]: at validate (/app/node_modules/mongoose/lib/schematype.js:1365:13)
2026-01-07T05:54:39.038239+00:00 app[web.1]: at SchemaType.doValidate (/app/node_modules/mongoose/lib/schematype.js:1349:7)
2026-01-07T05:54:39.038239+00:00 app[web.1]: at /app/node_modules/mongoose/lib/document.js:3004:18
2026-01-07T05:54:39.038240+00:00 app[web.1]: at process.processTicksAndRejections (node:internal/process/task_queues:77:11) {
2026-01-07T05:54:39.038241+00:00 app[web.1]: properties: {
2026-01-07T05:54:39.038242+00:00 app[web.1]: validator: [Function (anonymous)],
2026-01-07T05:54:39.038242+00:00 app[web.1]: message: 'Path `content` is required.',
2026-01-07T05:54:39.038242+00:00 app[web.1]: type: 'required',
2026-01-07T05:54:39.038243+00:00 app[web.1]: path: 'content',
2026-01-07T05:54:39.038243+00:00 app[web.1]: fullPath: undefined,
2026-01-07T05:54:39.038243+00:00 app[web.1]: value: ''
2026-01-07T05:54:39.038243+00:00 app[web.1]: },
2026-01-07T05:54:39.038243+00:00 app[web.1]: kind: 'required',
2026-01-07T05:54:39.038244+00:00 app[web.1]: path: 'content',
2026-01-07T05:54:39.038244+00:00 app[web.1]: value: '',
2026-01-07T05:54:39.038244+00:00 app[web.1]: reason: undefined,
2026-01-07T05:54:39.038244+00:00 app[web.1]: [Symbol(mongoose:validatorError)]: true
2026-01-07T05:54:39.038244+00:00 app[web.1]: }
2026-01-07T05:54:39.038245+00:00 app[web.1]: },
2026-01-07T05:54:39.038245+00:00 app[web.1]: _message: 'ChatSession validation failed'
2026-01-07T05:54:39.038245+00:00 app[web.1]: }
2026-01-07T05:54:39.038245+00:00 app[web.1]: 
2026-01-07T05:54:39.038246+00:00 app[web.1]: Node.js v20.19.6
2026-01-07T05:54:39.087913+00:00 heroku[web.1]: Process exited with status 1
2026-01-07T05:54:39.111996+00:00 heroku[web.1]: State changed from up to crashed
2026-01-07T05:54:39.115752+00:00 heroku[web.1]: State changed from crashed to starting
2026-01-07T05:54:43.724451+00:00 heroku[web.1]: Starting process with command `node dist/index.js`
2026-01-07T05:54:45.092585+00:00 app[web.1]: {"level":30,"time":"2026-01-07T05:54:45.092Z","service":"class-chat-node","environment":"production","msg":"Running in production — HTTP behind Heroku SSL terminator"}
2026-01-07T05:54:45.940135+00:00 heroku[web.1]: State changed from starting to up
2026-01-07T05:54:45.824151+00:00 app[web.1]: {"level":30,"time":"2026-01-07T05:54:45.824Z","service":"class-chat-node","environment":"production","msg":"Connected to main DB (legacy) successfully."}
2026-01-07T05:54:45.831092+00:00 app[web.1]: {"level":30,"time":"2026-01-07T05:54:45.826Z","service":"class-chat-node","environment":"production","msg":"✅ WebSocket server ready – detailed auth logging enabled"}
2026-01-07T05:54:45.831094+00:00 app[web.1]: {"level":30,"time":"2026-01-07T05:54:45.830Z","service":"class-chat-node","environment":"production","msg":"Server running on http://localhost:27500"}
2026-01-07T05:54:45.903293+00:00 app[web.1]: (node:2) [MONGOOSE] Warning: mongoose: Cannot specify a custom index on `_id` for model name "ChatSession", MongoDB does not allow overwriting the default `_id` index. See https://bit.ly/mongodb-id-index
2026-01-07T05:54:45.903295+00:00 app[web.1]: (Use `node --trace-warnings ...` to show where the warning was created)