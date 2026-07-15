# Meta (Facebook) App Review & Data Handling Responses

This document contains pre-filled responses, settings, and guidelines for submitting the TikLivePro Meta App for review and answering the Data Handling Questionnaire.

---

## 1. Verification

To submit your app for review, Meta requires **Business Verification** and **Domain Verification**.

### Domain Verification
1. Go to **Meta Business Suite** -> **Business Settings** -> **Brand Safety and Suitability** -> **Domains**.
2. Click **Add** and enter `tiklivepro.me`.
3. Choose one of the verification methods:
   - **TXT DNS Record** (Recommended): Add the Meta-provided TXT record to your DNS configuration.
   - **HTML File Upload**: Upload the verification file to the root of your web server.
   - **Meta Tag Verification**: Add the `<meta>` tag to the header of the landing page.
4. Click **Verify Domain**.

### Business Verification
1. In the Meta Developer Dashboard, go to **Basic Settings**.
2. Under **Business Verification**, link your app to an approved Meta Business Account.
3. If not already verified, submit your official incorporation documents, utility bills, or address registration matching your legal entity's info.

---

## 2. App Settings

Ensure the following configuration is saved in your Meta Developer Dashboard under **App Settings -> Basic**:

| Dashboard Field | Production Value | Description |
| :--- | :--- | :--- |
| **Display Name** | `TikLivePro` or `TikLivePro Live` | The user-facing name displayed in the OAuth dialog. |
| **App Domains** | `tiklivepro.me` | Root domain where OAuth requests originate. |
| **Privacy Policy URL** | `https://tiklivepro.me/legal/privacy` | Direct link to the Privacy Policy. |
| **Terms of Service URL** | `https://tiklivepro.me/legal/terms` | Direct link to the Terms of Service. |
| **User Data Deletion** | Select **Data Deletion Callback URL** | Method for users to request data deletion. |
| **Callback URL** | `https://tiklivepro.me/api/auth/facebook/deletion` | Secure HTTPS endpoint that processes signed deletion requests. |
| **Category** | `Business and Finance` or `Utility` | Relevant application category. |

---

## 3. Allowed Usage

When applying for **Advanced Access** for permissions in **App Review -> Permissions and Features**, use the following descriptions:

### `pages_show_list`
* **Purpose**: List the Facebook Pages managed by the user.
* **Review Description**:
  > TikLivePro enables creators to broadcast their live video streams to their Facebook Pages. We require `pages_show_list` so that when a creator initiates the connection flow, we can display a list of the Facebook Pages they manage in our dashboard. The creator can then choose which specific Page they want to authorize as a broadcast destination. We only request this permission to populate the Page selector dropdown in the user settings.

### `pages_manage_posts`
* **Purpose**: Publish live video broadcasts to the selected Facebook Page.
* **Review Description**:
  > TikLivePro is a multi-platform live streaming application. We use `pages_manage_posts` to programmatically create and publish live video streams on the user's behalf. When the user starts a broadcast in our control room, we call the Meta Graph API (`POST /{page_id}/live_videos`) using the Page access token to generate the RTMP ingest URL and publish the live video post on their selected Facebook Page. Without this, we cannot deliver live video to the Page.

### `pages_read_engagement`
* **Purpose**: Read comments in real time during the live stream.
* **Review Description**:
  > TikLivePro features a unified comment dashboard that aggregates chat messages from all connected destinations in real-time. We use `pages_read_engagement` to read user comments posted on the active Facebook Live broadcast (via `GET /{live_video_id}/comments` polling or webhooks). This allows creators to see and interact with their Facebook audience from a single screen, improving engagement without switching tabs.

---

## 4. Data Handling (Meta Questionnaire)

Use these answers to complete the Meta **Data Handling Questionnaire**:

### Question: `processor-0`
> *Do you have data processors or service providers, including your own companies, that will have access to the Platform Data that you obtain from Meta?*

* **Answer**: **Yes**
* **Processor Details**:
  1. **DigitalOcean LLC**
     * **Role**: Infrastructure Host (Cloud Virtual Private Servers & Managed Database).
     * **Data Accessed**: Encrypted access tokens, user profiles, and session data are stored securely on database instances hosted on DigitalOcean servers.
     * **Location**: United States / Germany (depending on server region).
  2. **Stripe, Inc.**
     * **Role**: Payment Processor.
     * **Data Accessed**: Basic billing identifier data (e.g., user email addresses) to link premium subscriptions. *Note: Stripe does not access Meta access tokens.*
     * **Location**: United States.

---

### Question: `responsible-1`
> *Who is the person or entity that will be responsible for all Platform Data Meta shares with you?*

* **Answer**: Enter your official legal entity name.
  * *Template*: `[Your Legal Entity Name or Company Name]` (e.g., `TikLivePro LLC`)
  * *Description*: The legal entity that controls data and determines the purposes/means of processing Platform Data in connection with the TikLivePro service.

---

### Question: `responsible-2`
> *Select the country where this person or entity is located.*

* **Answer**: Select your entity's registered country (e.g., `United States`, `France`, etc.).

---

### Question: `requests-3`
> *Have you provided the personal data or personal information of users to public authorities in response to national security requests in the past 12 months?*

* **Answer**: **No**

---

### Question: `requests-4`
> *Which of the following policies or processes do you have in place regarding requests from public authorities for the personal data or personal information of users? Check all that apply.*

* **Selected Answers**:
  * [x] **Required review of the legality of these requests.**
    * *Reason*: All data access requests from public authorities must undergo strict legal review by our counsel to ensure compliance with applicable jurisdiction laws before any disclosures.
  * [x] **Data minimization policy—the ability to disclose the minimum information necessary.**
    * *Reason*: Our internal policy dictates that if we are legally compelled to disclose any data, we only disclose the absolute minimum data required to satisfy the specific lawful order.
  * [x] **Documentation of these requests, including your responses to the requests and the legal reasoning and actors involved.**
    * *Reason*: We maintain an internal audit log of all legal inquiries, warrants, requests, responses, and legal justifications involved in compliance processes.

---

## 5. Data Protection

Details on how TikLivePro secures Platform Data in accordance with Meta Platform Terms:

* **Encryption at Rest**:
  All Meta access tokens (User Access Tokens and Page Access Tokens) are encrypted at rest in the PostgreSQL database using **AES-256-GCM**. The encryption keys are securely injected via environment variables (`FACEBOOK_APP_SECRET`) and are not stored with the data.
* **Encryption in Transit**:
  All external traffic between the browser client and TikLivePro API Gateway, as well as all backend-to-Meta API traffic, is strictly enforced over **HTTPS (TLS 1.2 / 1.3)** using auto-renewing Let's Encrypt certificates managed by Caddy.
* **Data Minimization & Deletion**:
  We do not store Facebook user passwords or personal files. When a user disconnects their Facebook account in settings, all related Facebook tokens are immediately and permanently hard-deleted from our databases.
* **Compliance with Data Deletion Callback**:
  Our server processes Meta's real-time Signed Requests at `POST /api/auth/facebook/deletion`. Upon verification of the HMAC-SHA256 signature, the user's connected social tokens are immediately purged, and a status confirmation URL with a tracking ID is returned.

---

## 6. Reviewer Instructions

When submitting the App Review, provide the following step-by-step instructions to the Meta Reviewer so they can test the integration in development mode:

### 1. Test Credentials
* **TikLivePro Test Account**:
  * **Email/Username**: `reviewer-test@tiklivepro.me`
  * **Password**: `[Provide a test password here]`
* **Facebook Test Account**:
  * **Email/Username**: `[Provide Facebook test account credentials or add a Meta Developer App role user]`
  * *Note*: Ensure this Facebook user has administrator access to at least one test Facebook Page with posts enabled.

### 2. Verification Steps for the Reviewer
1. Navigate to the TikLivePro landing page at `https://tiklivepro.me` and log in with the provided **TikLivePro Test Account**.
2. Go to **Settings** -> **Connected Accounts** (or click `/accounts` directly).
3. Under the **Connect a platform** grid, click the **Facebook** tile.
4. You will be redirected to the Facebook Login OAuth consent screen. Log in using the **Facebook Test Account**.
5. Grant the permissions requested (`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`).
6. After accepting, you will be redirected back to the TikLivePro dashboard with a success toast. Verify that the Facebook account is now listed under **Connected Accounts** with a status of `Connected`.
7. Navigate to the **Dashboard** and click **Go Live**.
8. Fill in the stream settings (Title, Description) and, under **Destinations**, toggle the switch next to your connected **Facebook Page**.
9. Click **Start Stream**. This generates the live video endpoint.
10. In a separate tab, open your Facebook Page. Verify that a Live Video post has been created and is active.
11. Add a comment under the Live Video post on Facebook.
12. Return to the TikLivePro **Control Room**. Verify that the comment you just posted appears in the unified chat panel in real time.
13. Click **End Stream** in the Control Room. Verify the stream status changes to finished.
14. Go back to **Settings** -> **Connected Accounts** and click **Disconnect** on the Facebook card. Verify that all connection info is cleared.
