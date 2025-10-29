# Security Integration

## Existing Security Architecture Preserved

All enhancements maintain the current security model. **No breaking changes to authentication or authorization**.

### Authentication Layer (Unchanged)

**JWT HTTP-Only Cookies** (Critical Constraint from CLAUDE.md):
- **Token Generation**: `createToken(id, email, "7d")` - 7-day expiration
- **Token Storage**: HTTP-only signed cookies (prevents XSS access)
- **Token Verification**: `verifyToken` middleware extracts JWT from cookie, validates signature
- **Session Management**: Stateless (JWT contains user ID + email)

**Cookie Configuration**:
```typescript
res.cookie(COOKIE_NAME, token, {
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  signed: true,          // Requires cookie-parser secret for tampering detection
  sameSite: 'strict',    // CSRF protection
  secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

**OAuth Integration**:
- Google OAuth via `google-auth-library` (existing)
- OAuth users bypass password requirements
- FR20: Requires Google app verification before beta (remove "unverified app" warning)

### Authorization Layer (Unchanged)

**Resource Ownership Validation**:
```typescript
// Existing pattern (preserved in all new endpoints)
export const deleteMaterial = async (req, res) => {
  const userId = res.locals.jwtData?.id;  // From JWT
  const material = await SavedMaterial.findById(req.params.materialId);

  // Authorization check
  if (!material || material.userId.toString() !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Proceed with deletion
};
```

**Applied to**:
- Documents (user can only view/delete own documents)
- Chat sessions (user can only view own chats)
- Saved materials (user can only edit/delete own materials) **[NEW]**
- User data (user can only modify own profile, delete own account) **[NEW]**

## New Security Features

### 1. Login Rate Limiting (FR11)

**Purpose**: Prevent brute-force password attacks

**Implementation**:
```typescript
// backend/src/utils/rateLimitLogin.ts (NEW)
export const rateLimitLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return next(); // Don't reveal if email exists

  const now = Date.now();
  const resetTime = user.loginAttemptResetAt?.getTime() || 0;
  const attempts = user.loginAttempts || 0;

  // Reset counter after 15 minutes
  if (now - resetTime > 15 * 60 * 1000) {
    user.loginAttempts = 0;
    user.loginAttemptResetAt = new Date();
    await user.save();
    return next();
  }

  // Block after 5 attempts
  if (attempts >= 5) {
    return res.status(429).json({
      message: "Too many login attempts. Please try password reset or wait 15 minutes."
    });
  }

  return next();
};
```

**Security Properties**:
- **No email enumeration**: Returns generic message for non-existent emails
- **Time-based reset**: Attempts reset after 15 minutes
- **Database-backed**: Survives server restarts

### 2. Enhanced Input Validation (FR12)

**Password Strength Validation** (Existing - Enhanced):
```typescript
const passwordValidator = body("password")
  .isLength({ min: 8 })
  .withMessage("Password must be at least 8 characters")
  .matches(/[A-Za-z]/)
  .withMessage("Password must contain at least one letter")
  .matches(/\d/)
  .withMessage("Password must contain at least one number");
```

**Email Validation** (Existing):
```typescript
const emailValidator = body("email")
  .trim()
  .isEmail()
  .withMessage("Valid email is required")
  .normalizeEmail();  // Prevents email case variation attacks
```

### 3. Password Reset Security (FR10 - Already Implemented)

**Token-Based Reset Flow**:
```typescript
// 1. Generate reset token (cryptographically random)
import crypto from 'crypto';
const resetToken = crypto.randomBytes(32).toString('hex');
user.passwordResetToken = resetToken;
user.passwordResetExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
await user.save();

// 2. Send reset email (link with token)
const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

// 3. Validate token on reset
const user = await User.findOne({
  passwordResetToken: token,
  passwordResetExp: { $gt: new Date() }, // Token not expired
});
```

**Security Properties**:
- **Cryptographically random tokens**: 32-byte random (not guessable)
- **Time-limited**: 1-hour expiration
- **Single-use**: Token deleted after successful reset
- **No email enumeration**: Always returns 200
- **Rate limiting**: 60-second cooldown between reset emails

### 4. Account Deletion Security (FR13)

**Cascading Delete with Authorization**:
```typescript
export const deleteAccount = async (req: Request, res: Response) => {
  const userId = res.locals.jwtData?.id;
  const { password } = req.body;

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  // Require password confirmation (prevent accidental deletion)
  const isValid = await compare(password, user.password);
  if (!isValid) return res.status(401).json({ message: "Invalid password" });

  // Cascading delete (all user data)
  try {
    // 1. Delete chat sessions
    await ChatSession.deleteMany({ userId });

    // 2. Delete documents (MongoDB)
    const docs = await Document.find({ userId });
    await Document.deleteMany({ userId });

    // 3. Delete chunks (study_materials2 collection)
    await mongoClient.db().collection('study_materials2').deleteMany({ user_id: userId.toString() });

    // 4. Delete S3 files
    for (const doc of docs) {
      await s3.send(new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET_NAME, Key: doc.s3Key }));
    }

    // 5. Delete saved materials
    await SavedMaterial.deleteMany({ userId });

    // 6. Delete user
    await user.deleteOne();

    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    (req as any).log?.error({ userId, error }, "Partial account deletion failure");
    return res.status(500).json({ message: "Account deletion failed. Please contact support." });
  }
};
```

**Security Properties**:
- **Password confirmation required**: Prevents unauthorized deletion
- **Cascading delete**: All user data removed (GDPR compliance)
- **Audit logging**: Deletion attempts logged with user context

## Data Protection

### Sensitive Data Handling

**Passwords**:
- **Hashing**: bcrypt with 10 rounds (existing)
- **Storage**: Hashed passwords only (never plaintext)
- **Transmission**: HTTPS only

**Email Addresses**:
- **Normalization**: Lowercased, trimmed
- **Verification Required**: Email verification before account activation
- **Change Notification**: Old email notified when email changed

**API Keys** (OpenAI, AWS):
- **Storage**: Environment variables only (never committed to git)
- **Transmission**: Server-to-server only (never exposed to frontend)
- **Rotation**: Multi-key rotation for OpenAI (FR19)

**Documents**:
- **Encryption at rest**: S3 server-side encryption (AES-256) - verify enabled
- **Access control**: S3 pre-signed URLs (time-limited, user-scoped)
- **Deletion**: Permanent deletion from S3 on document delete

### Database Security

**MongoDB Atlas**:
- **Authentication**: Username/password (from `MONGO_CONNECTION_STRING`)
- **Network isolation**: IP whitelist (Atlas dashboard configuration)
- **Encryption in transit**: TLS connection (`mongodb+srv://`)
- **Encryption at rest**: Atlas default (AES-256) - verify enabled

**Redis**:
- **Authentication**: TLS connection (`REDIS_TLS_URL`)
- **Network isolation**: Heroku Redis add-on (private network)

## API Security

### Rate Limiting

**Current Implementation**: Login rate limiting only (FR11)

**Post-Beta Recommendations**:
- Global rate limiting: 100 requests/minute per IP
- Endpoint-specific limits:
  - `/api/v1/chat/*`: 20 requests/minute per user
  - `/api/v1/documents/upload`: 10 uploads/hour per user

### CORS Configuration

**Existing Configuration**:
```typescript
app.use(cors({
  origin: process.env.CLIENT_ORIGIN, // https://app.classchatai.com
  credentials: true,                 // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### HTTPS Enforcement

**Production Deployment**:
- **Frontend (Vercel)**: HTTPS enforced by default
- **Backend (Heroku)**: HTTPS enforced by Heroku router
- **Cookie secure flag**: Enabled in production

## Frontend Security

### XSS Prevention

**React Default Protection**: JSX auto-escapes user input

**Markdown Rendering** (Special Case):
```typescript
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  }}
>
  {content}
</ReactMarkdown>
```

**Safe Patterns**:
- `rel="noopener noreferrer"` on external links (prevents tabnabbing)
- No `eval()` or `new Function()`
- No inline event handlers (`onclick`, `onerror`)

### CSRF Prevention

**SameSite Cookies** (Primary Defense):
```typescript
res.cookie(COOKIE_NAME, token, {
  sameSite: 'strict',  // Cookie only sent for same-site requests
});
```

## Logging & Monitoring for Security

### User Context Logging (FR16)

**Node API**:
```typescript
// JWT middleware injects userId into logger
(req as any).log = base.child({ userId: decoded.id });

// All logs include user context
(req as any).log?.warn({ action: "login_failed", email }, "Failed login attempt");
```

**Python AI**:
```python
# All RAG operations log user_id
log.info("Processing query", user_id=user_id, query=user_query)
```

### Security Event Logging

**Log the Following**:
- Failed login attempts (email, timestamp)
- Password reset requests
- Account deletions
- Document uploads (userId, fileType, fileSize)
- Rate limit triggers

**Example**:
```typescript
(req as any).log?.warn({
  event: "rate_limit_triggered",
  userId,
  endpoint: "/api/v1/user/login",
  attempts: user.loginAttempts
}, "User rate limited");
```

## Security Checklist (Pre-Launch)

**Before Beta Launch** - Verify all security configurations:

- [ ] **JWT_SECRET** is strong (64+ characters, random) in production
- [ ] **COOKIE_SECRET** is strong (64+ characters, random) in production
- [ ] **HTTPS enforced** on all services
- [ ] **CORS origin whitelist** contains only production frontend URL
- [ ] **MongoDB Atlas IP whitelist** configured (if applicable)
- [ ] **S3 bucket** is private (not public-read)
- [ ] **S3 encryption at rest** enabled
- [ ] **MongoDB encryption at rest** enabled
- [ ] **Google OAuth app verification** completed (FR20)
- [ ] **Password validators** enforced on all password endpoints
- [ ] **Rate limiting** enabled for login endpoint
- [ ] **User context logging** working in production
- [ ] **No hardcoded secrets** in codebase
- [ ] **All `.env` files in `.gitignore`**

---
