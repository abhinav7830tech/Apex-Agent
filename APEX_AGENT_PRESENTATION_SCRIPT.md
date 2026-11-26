# APEX AGENT — Final Year Presentation Script

**Prepared:** 20 November 2026  
**Audience:** Principal, Dean, Head of Department, project guide and CSE faculty, SRMSCET&R, Bareilly.  
**Language note:** Presentation wording is professional English; the speaking script is natural Hinglish (conversational Hindi in Latin script), suitable for a B.Tech final-year student.  
**Accuracy policy:** Every claim follows the current repository. Placeholders for roll numbers, guide and session were not invented. AI features are described as conditional on valid credentials and transcript availability.

---

## How to use this script

- Read the *Speaking script* aloud; it is written in short, spoken sentences.
- Use *Simple explanation* if faculty ask for the concept behind the slide.
- *Points to emphasise* are the lines you should not skip.
- *Possible faculty questions* include a ready answer after each question.
- Native speaker notes with a condensed version of each script are also embedded in the PPTX.

---

## Slide 01 — Title Slide — APEX AGENT

**What is displayed:** Project title, tagline, college and department, three student names with editable roll-number placeholders, editable guide/session placeholders, and a right-hand project snapshot card.

**Speaking script (Hinglish):**

> Good morning respected Principal sir, Dean sir, HOD sir, guide sir and all faculty members. Main Abhinav Agnihotri hoon aur aaj main apne final year project ke baare mein present karunga — APEX AGENT. Ye ek AI-powered meeting management aur intelligence SaaS platform hai. Iska tagline hai 'One Platform. Smarter Work.' Humne ye project SRMSCET&R, Bareilly ke Department of Computer Science and Engineering mein banaya hai. Team mein teen log hain — Abhinav Agnihotri, Aman Sharma aur Swati Saini. Slide par roll numbers, guide ka naam aur academic session ke liye clear placeholders rakhe hain, kyunki ye details repository mein available nahi thi — main unhe presentation se pehle fill kar dunga. Agle slide se main batata hoon ki ye platform karta kya hai.

**Simple technical explanation:**

Ye slide sirf pehchaan hai: project ka naam, kis college ne banaya, kaun banaye hue hain aur guide kaun hai. Placeholders isliye hain taaki koi bhi information manufactured na ho.

**Points to emphasise:**

- Team ke naam actual repository se liye gaye hain (about-developers page).
- Roll numbers, guide aur session editable placeholders hain — jhoothi information nahi.
- SaaS ka matlab: software as a service, yani browser se chalne wala hosted product.

**Possible faculty questions:**

- SaaS ka matlab kya hai? — Software as a Service; application cloud par host hoti hai aur browser se use hoti hai.
- Team mein kisne kya kiya? — Abhinav lead aur full-stack, Aman backend aur AI, Swati frontend aur UI/UX.

---

## Slide 02 — Project Overview

**What is displayed:** One-sentence definition in an academic serif block, three cards for problem/users/differentiator, and a three-step product loop.

**Speaking script (Hinglish):**

> Sir, ek line mein kahun to Apex Agent ek aisa platform hai jahan user apna khud ka AI agent banata hai, us agent ke saath real video meeting karta hai, aur meeting khatam hote hi usme se intelligent output nikalta hai — summary, decisions, action items, talk time, transcript aur searchable answers. Problem ye hai ki meetings mein bahut kuch bola jata hai par likh kar kuch nahi bachta. Iske users students, remote teams, project groups aur managers ho sakte hain. Difference ye hai ki hamara agent configurable hai — uske instructions user likh deta hai — aur pura pipeline event-driven aur durable hai. Neeche teen steps hain: agent banayo, meeting karo, intelligence lo.

**Simple technical explanation:**

System teen kaam karta hai: pehle AI agent define karo, phir uske saath video call karo, phir call ka automatic written report lo.

**Points to emphasise:**

- AI agent user-defined instructions follow karta hai.
- Har output database mein persist hota hai, sirf screen par nahi dikhta.
- Product loop teen steps ka hai — simple but complete.

**Possible faculty questions:**

- Ye sirf summary tool kyun nahi hai? — Kyunki isme agent creation, meeting lifecycle, guest access, analytics aur recovery states bhi hain.
- Agent ki instructions kahan stored hoti hain? — agents table ke instructions column mein.

---

## Slide 03 — Motivation

**What is displayed:** Left: why the project was built and what inspired it. Right: four problem cards — information overload, manual note-taking, missed decisions, no outcome tracking.

**Speaking script (Hinglish):**

> Sir, motivation do tarah ka tha. Technical motivation ye tha ki hum demo app nahi balki production-shaped product banayein — jisme auth, payments, video, AI aur analytics sab ho. Learning motivation ye tha ki modern AI stack ko end-to-end samjhein: realtime voice, durable background jobs, serverless database aur typed APIs. Doosri taraf impractical problem hai — meeting ke baad information overload hota hai, notes manually likhne padte hain, decisions aur action items reh jate hain, aur output track karna mushkil ho jata hai. Isliye humne ek aisa system banaya jo meeting ko direct knowledge mein badle.

**Simple technical explanation:**

Humne ye isliye banaya kyunki meetings mein time to lagta hai par uska written result nahi bachta. Saath hi ye poora modern tech stack seekhne ka bhi exercise tha.

**Points to emphasise:**

- Research inspiration: AMI meeting corpus aur summarization survey.
- Chaar practical problems: overload, manual notes, missed decisions, tracking.
- Student team ke liye realistic learning goal.

**Possible faculty questions:**

- Kya ye existing products se copy kiya gaya hai? — Nahi; product inspiration hai par implementation, data model aur pipeline is repository ke apne hain.
- AMI corpus kya hai? — Meeting recordings ka publicly available research dataset.

---

## Slide 04 — Problem Statement

**What is displayed:** Two columns: technical problems and practical problems, with a consequence band at the bottom.

**Speaking script (Hinglish):**

> Sir, problem statement ko main do hisson mein baatunga. Technical side par pehla issue hai fragmented state — Stream ke webhooks asynchronously aate hain aur database ko uske saath consistent rehna padta hai. Doosra hai unstructured transcript — JSONL lines mein speaker IDs hote hain jinhe real names se map karna padta hai. Teesra hai unreliable AI steps — LLM call ya signed URL fail ho sakti hai, isliye retry aur idempotency zaroori hai. Chautha hai type safety aur security boundaries. Practical side par decisions scatter ho jate hain, manual notes padte hain, purani baat search nahi hoti, aur kisi ko pata nahi ki kisne kitna bola. Bottom line: meetings time leti hain par reusable knowledge nahi deti.

**Simple technical explanation:**

Engineering problem: events, transcripts, AI failures aur security ko sambhalna. User problem: meeting ka result yaad nahi rehta aur search nahi hota.

**Points to emphasise:**

- Idempotency aur retries design ke core hain.
- Speaker IDs ko users, agents aur guests se resolve kiya jata hai.
- Har query user_id se scoped hai — cross-user data leak nahi.

**Possible faculty questions:**

- Idempotency kya hai? — Ek hi event ko do baar process hone se rokna, yahin event ID use karke.
- Transcript JSONL kya hai? — Ek line = ek JSON object; Stream yahi format deta hai.

---

## Slide 05 — Project Objectives

**What is displayed:** Six numbered objective cards, each beginning with 'To'.

**Speaking script (Hinglish):**

> Sir, humare paas chahein objective hain. Pehla: secure authentication aur har data ka owner-scoping. Doosra: end-to-end type-safe API jo database se pehle input validate kare. Teesra: meeting ka poora lifecycle — scheduling, overlap check, reminders aur status transitions. Chautha: host aur external guests ke liye signed, short-lived tokens. Paanchva: Stream transcript ko speaker-labelled intelligence mein badalna using Inngest aur OpenAI. Chhatva: insights ko summaries, Ask AI, analytics, notifications aur PDF export ke through users tak pahunchaana. Har objective technically measurable hai aur code mein corresponding implementation hai.

**Simple technical explanation:**

Har objective ek kaam hai jo system ko karna chahiye — login, typed API, meeting lifecycle, guest access, AI processing aur output delivery.

**Points to emphasise:**

- Sab objectives 'To' se shuru hote hain, jaise academic rubric mein chahiye.
- Har objective ka code mein equivalent module hai.
- Security aur ownership peh le objective hai — foundation ki tarah.

**Possible faculty questions:**

- Overlap detection kaise karta hai? — Nayi meeting ke scheduledAt aur endsAt ko existing meetings se compare karta hai.
- Type-safe API ka fayda? — Server par change karte hi client par TypeScript error aa jata hai.

---

## Slide 06 — Existing System

**What is displayed:** Typical conventional meeting flow (schedule → join → talk → leave) and six limitation bullets with a 'gap' card.

**Speaking script (Hinglish):**

> Sir, purana flow simple hai — meeting schedule karo, call join karo, baat karo, call chhod do. Recording to store ho jati hai lekin uske aage kuch nahi. Isme limitation ye hai ki recording ek file hai, knowledge nahi; speaker-labelled transcript aur talk time manually nahi milta; decisions aur owners note lene wale par depend hote hain; purani baat search karni ho to poora video dekhna padta hai; aur agar koi automated tool ho bhi to uska failure path clear nahi hota. Gap yahi hai — call aur action ke beech mein intelligence ka gap. Apex Agent usi gap ko target karta hai.

**Simple technical explanation:**

Purane systems call ke baad ruk jate hain. Recording hoti hai par usme se decision nikalna insaan ko karna padta hai.

**Points to emphasise:**

- Recording ≠ searchable knowledge.
- Failure states ka absence bhi ek limitation hai.
- Gap slide se proposed system ka justification milta hai.

**Possible faculty questions:**

- Kya Zoom/Meet recording nahi dete? — Dete hain, par unka focus communication hai; structured post-meeting intelligence alag kaam hai.
- Apex Agent kis gap ko fill karta hai? — Call ke baad ka structured, searchable output.

---

## Slide 07 — Proposed System

**What is displayed:** Left: six key improvements. Right: four capability cards. Bottom: design principle about honest failure states.

**Speaking script (Hinglish):**

> Sir, proposed system mein chhaye improvements hain. Pehla configurable AI participant — agent ka name, role, description aur instructions stored rehte hain. Doosra automatic evidence capture — Stream recording aur transcription karta hai aur webhook status badalta hai. Teesra durable processing — Inngest steps retry kar sakte hain. Chautha structured output — executive summary, topics, decisions, actions, questions, highlights aur sentiment. Paanchva human-facing intelligence — Ask AI, analytics, notifications aur PDF. Chhatva honest states — processing, failed aur retry first-class hain. Neeche principle likha hai: agar transcription ya AI available nahi to output manufacture nahi karenge; meeting failed state mein jayegi.

**Simple technical explanation:**

Proposed system meeting ko record nahi karta, usme se verified information nikalta hai — aur jab information na mile to failure dikhata hai.

**Points to emphasise:**

- Configurable agent — hard-coded bot nahi.
- Durable processing with retries.
- No fabricated output: ye hamari sabse important design honesty hai.

**Possible faculty questions:**

- Agar OpenAI key na ho to kya hoga? — Agent nahi jurega aur analysis failed/processing state mein rahega; fabricated summary nahi banegi.
- Durable function kya hai? — Jiska har step alag se retry ho sakta hai, Inngest yahi deta hai.

---

## Slide 08 — Literature Review / Related Work

**What is displayed:** Comparison table covering Zoom/Meet/Teams, AI assistants, AMI corpus, summarization survey, WebRTC/Web Speech, and this project.

**Speaking script (Hinglish):**

> Sir, literature review mein humne teen categories dekhi. Pehli conventional video platforms — Zoom, Google Meet, Teams — ye communication aur recording mein mature hain par structured post-meeting knowledge unka focus nahi hai. Doosri AI meeting assistants — Otter, Fireflies jaise tools — dikhati hain ki automatic notes ka value hai, lekin ye commercial closed systems hain aur hamari implementation nahi hain. Teesri research side — AMI meeting corpus batata hai ki meetings mein overlapping speech aur speaker attribution kitni hard hai; Nenkova aur McKeown ka summarization survey summarization choices ka basis deta hai. WebRTC aur Web Speech API ne real-time media aur browser captions ka foundation diya. Hamara original contribution integration hai: configurable agent, signed webhook, durable pipeline aur user-scoped knowledge.

**Simple technical explanation:**

Humne existing tools aur research padha. Unse idea mila par implementation aur integration hamari apni hai.

**Points to emphasise:**

- Product features high-level hain; koi benchmark nahi chalaya.
- References authentic hain — DOI aur official docs slide 25 par hain.
- Original contribution clearly distinguished.

**Possible faculty questions:**

- Kya aapne in products ka benchmark kiya? — Nahi, sirf public documentation ke aadhar par high-level comparison kiya.
- AMI corpus kaise relevant hai? — Ye batata hai ki meeting data inherently messy hota hai: overlap, speakers, dialog acts.

---

## Slide 09 — Comparative Analysis

**What is displayed:** Feature-by-feature table comparing conventional tools, AI assistants and Apex Agent.

**Speaking script (Hinglish):**

> Sir, ye table capability-wise comparison hai. Video meetings aur recording conventional tools mein hoti hai. Guest join without account bhi aam hai. Lekin speaker-labelled transcript, talk time, AI summary plus decisions plus actions, cross-history Ask AI, retryable background processing aur khud ka type-safe data model — ye sab combine karke dikhane wala hamara system hai. Main explicitly bol raha hoon: Apex Agent column sirf un capabilities ko claim karta hai jo code mein implement hain aur repository mein test evidence hai. Koi marketing claim nahi hai.

**Simple technical explanation:**

Har row ek feature hai. Apex Agent wale column mein sirf wahi likha hai jo actually banana hai aur test bhi hua hai.

**Points to emphasise:**

- Comparison evidence-based hai.
- Type-safe API aur retryable jobs hamare differentiators hain.
- Commercial tools ki internal implementation hum nahi jaante.

**Possible faculty questions:**

- Kya aapke paas koi performance metric hai? — Nahi; main koi fabricated benchmark nahi de raha. Evidence test reports hain.
- AI assistants se comparison kaise kiya? — Public feature descriptions ke aadhar par, high-level.

---

## Slide 10 — Tools and Technologies

**What is displayed:** Eight category cards: frontend, backend/API, database, authentication, real-time, AI/LLM, background jobs, infrastructure/extras — each with purpose.

**Speaking script (Hinglish):**

> Sir, tech stack actual package.json se verify kiya gaya hai. Frontend — Next.js 15 App Router, React 19, TypeScript, Tailwind 4 aur shadcn/ui. Backend — tRPC v11 aur Zod, jo end-to-end type safety dete hain. Database — Neon serverless PostgreSQL aur Drizzle ORM. Authentication — Better Auth, email/password aur Google/GitHub OAuth. Real-time — Stream Video SDK. AI — OpenAI gpt-4o-mini analysis ke liye aur OpenAI Realtime in-call agent ke liye. Background jobs — Inngest. Infrastructure — Vercel, Stripe, Resend, jsPDF, Recharts. Har technology ke saath uska purpose likha hai, sirf naam nahi.

**Simple technical explanation:**

Har layer ke liye ek tool hai: UI, API, DB, login, video, AI, jobs aur deployment. Sab actual dependencies hain.

**Points to emphasise:**

- Next.js 15, Stream, OpenAI, Inngest, Neon — sab verify kiye gaye.
- tRPC + Zod se runtime validation bhi hoti hai.
- Stripe aur Resend optional hain.

**Possible faculty questions:**

- Drizzle ORM kyun? — TypeScript-first schema aur type-safe migrations.
- tRPC aur REST mein kya difference? — tRPC mein client ko router types directly milte hain, manual API client nahi chahiye.

---

## Slide 11 — System Architecture

**What is displayed:** Three-column architecture: clients, Apex Agent application layers, external services; event and data path bands at the bottom.

**Speaking script (Hinglish):**

> Sir, architecture teen columns mein hai. Left side clients — host browser, external guest aur browser speech API. Middle hamari Next.js application: UI layer, tRPC API layer, Better Auth security aur domain modules plus Drizzle. Right side external services — Stream Video, Inngest, OpenAI aur Neon PostgreSQL. Arrows dikhate hain ki browser HTTPS se API ko call karta hai, media WebRTC se Stream ko jata hai, events Inngest ko jate hain aur LLM calls OpenAI ko. Bottom band mein event path likha hai: signed Stream webhook, /api/webhook, idempotent Inngest event, durable pipeline, Neon aur notification. Ye actual code ka flow hai.

**Simple technical explanation:**

Browser → hamari app → external services. Events webhook se aate hain aur background jobs unhe process karte hain.

**Points to emphasise:**

- Webhook signature verify hoti hai, x-api-key bhi check hota hai.
- Auth middleware har protected procedure par lagta hai.
- Production build 22 routes generate karta hai.

**Possible faculty questions:**

- Webhook kyun? — Stream bahar ka system hai; wo HTTP event bhejta hai, app usse DB state sync karti hai.
- Secret key browser mein kyun nahi? — Stream secret server-only module mein hai; client ko sirf short-lived token milta hai.

---

## Slide 12 — System Workflow

**What is displayed:** Ten-step snake flowchart from authentication to published insights, plus failure and automation panels.

**Speaking script (Hinglish):**

> Sir, workflow step by step samjhiye. Pehle login, phir agent banaya, phir meeting schedule ki — isme DB row banta hai aur Stream call create hota hai. Phir host ya guest token lekar call mein aata hai. Call ke dauran AI agent Realtime se jud sakta hai aur captions local preview dikhti hain. Call khatam hote hi session_ended event status ko processing karta hai. Phir Inngest transcript resolve karta hai, parse karta hai, speaker names lagata hai aur talk time nikalta hai. gpt-4o-mini JSON output deta hai. Last mein output save hota hai, notification jati hai aur UI mein dikhata hai. Agar transcript na mile ya AI fail ho to status failed hota hai aur retry option milta hai. Automations mein reminders aur reconciliation crons hain.

**Simple technical explanation:**

Login → agent → meeting → call → processing → transcript → AI → output. agar kuch fail ho to failed state aur retry.

**Points to emphasise:**

- Transcript finalise hone mein time lagta hai, isliye bounded polling hai.
- Failure path deliberately design kiya gaya hai.
- Cron jobs stuck meetings aur reminders sambhalti hain.

**Possible faculty questions:**

- Call ends par transcript ready kyun nahi hoti? — Stream transcription asynchronously finalise karta hai, isliye polling.
- Retry analysis kya karta hai? — Meeting ko dobara processing pipeline mein bhejta hai, ownership check ke baad.

---

## Slide 13 — Data Flow Diagram

**What is displayed:** Level 0 context diagram and Level 1 subprocess/data-store diagram.

**Speaking script (Hinglish):**

> Sir, left side Level 0 context diagram hai — center mein Apex Agent system, chaaron taraf bahar entities: host, external guest, Stream Video, OpenAI/Inngest aur optional Stripe/Resend. Arrows data flow dikhate hain: meeting data, invite token, webhooks, analysis aur billing/mail. Right side Level 1 hai — system ko paanch subprocesses mein toda gaya hai: authenticate, manage meetings, video session, AI processing aur notify/analyse. Do data stores hain: D1 core data — users, agents, meetings; aur D2 derived data — transcripts, insights aur notifications. Ye DFD actual modules se match karta hai.

**Simple technical explanation:**

Level 0 dikhata hai system bahar ke kisne kya data deta hai. Level 0 ko todhkar Level 1 mein internal steps aur data stores dikhte hain.

**Points to emphasise:**

- Guest direct database access nahi karta — sirf token ke through.
- Derived data alag store hai kyunki wo AI se aata hai.
- Billing optional aur separate hai.

**Possible faculty questions:**

- Level 0 aur Level 1 mein kya difference hai? — Level 0 pura system ek box hai; Level 1 uske andar ke processes dikhata hai.
- D2 mein kya kya hai? — Transcript segments, AI insights aur notifications.

---

## Slide 14 — Database Design / ER Diagram

**What is displayed:** Eight actual entities — USER, AGENTS, MEETINGS, NOTIFICATIONS, MEETING_INVITES, MEETING_PARTICIPANTS, TRANSCRIPT_SEGMENTS, MEETING_GUESTS — with keys and relationships.

**Speaking script (Hinglish):**

> Sir, ye ER diagram direct src/db/schema.ts se banaya hai. Center mein MEETINGS hai, jiska user_id aur agent_id foreign key hai. USER se AGENTS aur MEETINGS dono ka one-to-many relation hai. MEETINGS se notifications, invites, participants aur transcript segments judte hain. MEETING_INVITES ka primary key khud 32-character token hai, taaki guess na ho sake. MEETING_GUESTS guest ke Stream user id se judta hai. Neeche note hai ki auth tables, rate-limit table aur billing cluster bhi schema mein hain. Sab user data user_id se scoped hai aur cascade delete lagta hai — matlab meeting delete karoge to uske participants aur segments bhi chale jayenge.

**Simple technical explanation:**

Ye database ka naksha hai. USER sabse upar, uske paas agents aur meetings hain, aur meeting ke andar notifications, invites, guests aur transcript segments hain.

**Points to emphasise:**

- Schema authoritative source hai — PowerPoint mein manually nahi banaya gaya.
- Primary keys text/nanoid hain, auto-increment integers nahi.
- Cascade delete aur user_id scoping data integrity aur security ke liye hai.

**Possible faculty questions:**

- Meetins ka primary key kya hai? — text id, nanoid se generate hota hai; integer nahi.
- Cascade delete kyun lagaya? — Parent row hatane par orphan records na bachein; integrity bani rahe.

---

## Slide 15 — UML Diagrams

**What is displayed:** Three side-by-side UML views: Use Case (Host, Guest, AI Agent, Cron), Sequence (Host → UI → tRPC → DB/Stream), and Component diagram.

**Speaking script (Hinglish):**

> Sir, UML mein teen views hain. Pehla use case — actors hain Host, Guest, AI Agent aur Cron; use cases hain sign in, agent banana, meeting schedule karna, call join karna, summary dekhna aur Ask AI. Doosra sequence diagram — Host UI se meeting create karta hai, UI tRPC ko validated call bhejta hai, tRPC database aur Stream ko call karta hai, webhook wapas aata hai, status UI tak pahunchta hai. AI analysis asynchronously Inngest aur OpenAI mein chalta hai. Teesra component diagram — React components, tRPC routers, Better Auth aur Drizzle adapters, Stream SDK aur Inngest/OpenAI clients. Ye teen milkar system ke alag-alag angles dikhaate hain.

**Simple technical explanation:**

Use case batata hai kaun kya karta hai, sequence batata hai kaunsa component kab call karta hai, component diagram batata hai code ke bade hisse kya hain.

**Points to emphasise:**

- Guests sirf join use case tak limited hain — unhe dashboard access nahi.
- Sequence me asynchronous AI step alag se marking kiya gaya hai.
- Teenon diagrams actual modules ke according hain.

**Possible faculty questions:**

- Use case aur sequence diagram mein kya antar hai? — Use case functional requirements dikhata hai; sequence time order ke saath interactions dikhata hai.
- Guest ke paas kaunse permissions hain? — Sirf valid invite se call join karna; private meeting data nahi.

---

## Slide 16 — Application Modules

**What is displayed:** Twelve module cards with honest status chips: Implemented, Requires keys, Foundation, Planned.

**Speaking script (Hinglish):**

> Sir, ye slide modules aur unki real status dikhata hai. Dashboard, auth, agent management, scheduling, guest invites, video call, transcript aur talk time, notifications — ye implemented hain. AI insights aur Ask AI code mein poore hain lekin valid OpenAI keys par depend karte hain — isliye 'Requires keys' likha hai. Billing ek foundation hai: checkout aur webhooks hain par quota enforcement default par off hai. Live rolling summaries is repository mein nahi hain — 'Planned' mark kiya hai. Maine status chips isliye rakhe hain taaki koi module working na bataya jaye sirf UI hone ki wajah se.

**Simple technical explanation:**

Har module ke saath likha hai ki wo pura chal raha hai, keys par depend karta hai, adhura hai ya sirf planned hai.

**Points to emphasise:**

- Status chips intentionally honest hain.
- UI ka hona = working feature nahi; ye yahin dikhaya hai.
- Planned features ko future scope slide mein bhi repeat kiya hai.

**Possible faculty questions:**

- Billing kaunse hisson mein kaam karta hai? — Checkout, signed webhook aur subscription reconciliation; quota enforcement default off hai.
- Live rolling summaries kyun nahi hain? — Implementation nahin ki gayi; post-meeting analysis hi available hai.

---

## Slide 17 — Meeting Management

**What is displayed:** Lifecycle states, then four cards: scheduling, Stream call creation, invite/access control, lifecycle actions.

**Speaking script (Hinglish):**

> Sir, meeting lifecycle states scheduled, upcoming, active, processing, completed, failed aur cancelled hai. Scheduling mein user meeting name, agent, description, timezone, date-time, duration aur participants deta hai. Backend past slot aur overlap reject karta hai, endsAt compute karta hai aur reminder notification insert karta hai. Creation ke time Stream call banti hai, transcription aur recording enable hoti hai, aur call id meeting row mein store hoti hai. Access control mein 32-character invite token, expiry, revocation, account-required option aur passcode rotation hai. Lifecycle actions — start, end for all, cancel, reschedule, delete aur retry analysis. Important fix ye hai ki participant left event ab call ko sabke liye khatam nahi karta; ending explicit owner action hai.

**Simple technical explanation:**

Meeting banane se lekar khatam karne tak sab steps controlled hain — time validate, call create, guest token dena, aur clearly end karna.

**Points to emphasise:**

- Timezone-aware scheduling aur overlap check.
- Guest access signed aur short-lived hai.
- Participant leave ≠ call end — ye audit ke baad fix kiya gaya.

**Possible faculty questions:**

- Agent meeting join karta hai? — Haan, host call start karne par agent Stream call member ke taur par add hota hai; Realtime connection keys par depend karta hai.
- Passcode kya hai? — Stream call ka access code jise host rotate kar sakta hai.

---

## Slide 18 — AI Meeting Intelligence

**What is displayed:** Six-step AI pipeline on the left; three status panels — working, conditional, not implemented — on the right.

**Speaking script (Hinglish):**

> Sir, AI pipeline chhah steps mein hai. Stream transcript aata hai, webhook ya bounded polling se URL resolve hoti hai, JSONL parse hota hai aur speaker IDs ko actual names se map kiya jata hai, transcript segments database mein save hote hain aur talk time nikalta hai, phir gpt-4o-mini structured JSON output deta hai, aur last mein meeting status completed hoti hai aur notification bheji jati hai. Right side par maine clearly alag kiya hai — working in code, conditional on credentials, aur not implemented. Live captions browser-local preview hain, authoritative transcript nahi. Prompt mein explicitly likha hai ki transcript ke bahar ki baat nahi likhni, koi owner ya deadline invent nahi karni.

**Simple technical explanation:**

Call ke baad transcript nikalna, speakers lagana, AI se summary aur actions nikalna — par sab kuch tabhi jab keys aur transcript available hon.

**Points to emphasise:**

- Speaker identification ID se name mapping hai, voice-print nahi.
- AI output validated JSON hai, free-form text nahi.
- Prompt hallucination rokne ke liye likha gaya hai.

**Possible faculty questions:**

- Speaker identification kaise hoti hai? — Stream transcript ke speaker_id ko meeting participants, agents aur guests ke names se map karke.
- Kya live summary ban raha hai call ke dauran? — Nahi; analysis post-meeting hota hai, captions sirf local preview hain.

---

## Slide 19 — User Interface and Screenshots

**What is displayed:** Six real, unmodified screenshots: sign-in, sign-up, dashboard, meetings, agents, live call.

**Speaking script (Hinglish):**

> Sir, ye actual screenshots hain — koi bhi fake UI nahi. Figure 1 aur 2 sign-in aur sign-up flows hain, jinme email/password aur OAuth options dikhte hain. Figure 3 dashboard hai — yahan meeting stats aur talk-time analytics dikh rahe hain. Figure 4 meetings list hai status filters ke saath. Figure 5 agents management table hai. Figure 6 host ka active call view hai, jo WebRTC guest test ke dauran capture hua — isme host aur do guests the. Maine caption mein figure numbering rakhi hai. Meeting summary aur Ask AI pages code mein implement hain lekin unke screenshots available assets mein nahi the, isliye main unhe yahan nahi dikh raha — ye bhi note kar diya hai.

**Simple technical explanation:**

Saare screenshots repository se liye gaye hain. Jin pages ke screenshots nahi mile, unke liye fabricate nahi kiya — note kar diya hai.

**Points to emphasise:**

- Sab figures actual project artifacts hain.
- Live call screenshot real WebRTC test se hai (3 participants).
- Missing screenshots ke liye honest footnote.

**Possible faculty questions:**

- Ye screenshots kab liye gaye? — Repository mein maujood artifacts se liye gaye hain; host-active-call guest E2E run ka hai.
- Summary page ka screenshot kyun nahi? — Available assets mein nahi tha; fabricate karne ke bajay note kar diya.

---

## Slide 20 — Testing and Validation

**What is displayed:** Eight-row test matrix with expected result, actual evidence, and honest status; local test totals in the footer.

**Speaking script (Hinglish):**

> Sir, testing table mein asli evidence hai. Auth, meeting creation, joining, guest access control aur participant behaviour ke tests pass hue — 62 server assertions aur 11 browser assertions documentation mein recorded hain, host aur do account-less guests ke saath, Stream par 3 live participants. Local level par maine khud bhi run kiya: 56 security tests aur 26 billing tests, sab pass. Transcript parsing aur speaker mapping ke unit tests pass hain. Lekin AI summary generation ka live OpenAI run available evidence mein nahi hai — isliye status 'Not run E2E' likha hai. Build aur type-check pass hain. Maine koi bhi such nahi banaya; jo run hua wo likha hai, jo nahi hua wo bhi likha hai.

**Simple technical explanation:**

Jo tests actually chalaye gaye, unke results diye hain. AI ka live end-to-end run nahi hua to wo bhi clearly bol diya hai.

**Points to emphasise:**

- 56 security + 26 billing tests local par pass.
- 62 server + 11 browser assertions documentation mein recorded.
- Live AI run unverified — explicitly marked.

**Possible faculty questions:**

- Browser test mein camera/mic real the? — Nahi, fake media devices use kiye gaye the; ye limitation bhi slide 23 par hai.
- Test coverage kya hai? — Security unit tests, billing tests aur guest meeting E2E; poori production coverage claim nahi karte.

---

## Slide 21 — Project Outcomes and Results

**What is displayed:** Six outcome cards: full-stack product, typed backend, multi-party calls, intelligence, reliability work, test evidence.

**Speaking script (Hinglish):**

> Sir, outcomes chhon categorizon mein hain. Pehla — ek complete Next.js 15 application jo 22 routes generate karti hai aur responsive dashboard rakhti hai. Doosra — type-safe backend, 30 se zyada tRPC procedures aur Zod validation. Teesra — real multi-party calls, host aur do guests, teen live participants ke saath verify kiya. Chautha — meeting intelligence, yani speaker-labelled transcript, talk time, structured AI output, PDF export aur Ask AI. Paanchva — reliability work: signed webhooks, idempotent events, per-meeting concurrency, failure states aur reconciliation. Chhatva — test evidence. Neeche scope note hai: ye implemented code aur repository evidence hai, koi deployed commercial product ka claim nahi hai.

**Simple technical explanation:**

Humne kya achieve kiya — ek chalne wala product, typed APIs, real calls, AI output, reliability aur tests.

**Points to emphasise:**

- Har outcome code ya test evidence se backed hai.
- No deployed-production or performance-metric claim.
- Reliability work ko outcome ki tarah dikhana zaroori hai kyunki ye real engineering hai.

**Possible faculty questions:**

- Production deploy hua? — Repository mein deploy ka evidence nahi hai; isliye claim nahi kar rahe.
- 22 routes kaise count hote hain? — Production build output se; Next.js App Router har page aur API route ko route banata hai.

---

## Slide 22 — Applications and Beneficiaries

**What is displayed:** Six application areas with beneficiary descriptions and a serif summary band.

**Speaking script (Hinglish):**

> Sir, applications chhon jagahon par hain. Corporate organisations mein meeting record, decisions aur action owners searchable memory ban jate hain. Educational institutions mein project reviews, guide meetings aur seminars ka structured summary milta hai. Remote teams ke liye guest join without account aur timezone-aware scheduling useful hai. Project management mein follow-ups chat threads se nikal kar ek jagah aate hain. Business meetings mein client calls ka consistent written record banta hai. Collaborative work mein talk-time aur topic analytics team ko participation samajhne mein madad deti hain. Primary beneficiary wo team hai jo baar-baar meetings karti hai aur recording ke bajay likha hai result chahti hai.

**Simple technical explanation:**

Koi bhi jagah jahan meetings hoti hain aur unka written record chahiye — college, office, remote team, project group — wahan ye kaam aata hai.

**Points to emphasise:**

- Educational institutions hamare immediate context hain.
- Guest access remote collaboration ka key enabler hai.
- Beneficiary define karte waqt recording ≠ result wala point yaad rakhein.

**Possible faculty questions:**

- College mein ye kaise use hoga? — Guide meetings aur project reviews ka summary aur action items store karke.
- Remote teams ke liye kya special hai? — Timezone support aur account-less guest join.

---

## Slide 23 — Limitations and Future Enhancements

**What is displayed:** Left: six honest limitations. Right: six realistic future enhancements.

**Speaking script (Hinglish):**

> Sir, limitations khulke bolna zaroori hai. Pehla — AI output Stream transcription aur valid keys par depend karta hai; transcript na mile to output invent nahi hota. Doosra — live captions sirf browser-local preview hain. Teesra — guest links reusable aur time-window based hain, unme host admit button ya per-guest email nahi hai. Chautha — billing quota enforcement default off hai aur role-based admin nahi hai. Paanchva — browser test fake media devices aur local dev server par tha. Chhatva — production database grants aur deployed session verify nahi hue. Future scope mein rolling in-call summaries, host admission, single-use links, RBAC, Agent Kit autonomy, deeper analytics aur full Playwright coverage hai. Ye sab realistic aur achievable enhancements hain.

**Simple technical explanation:**

Jo abhi nahi chal raha ya adha hai, wo sab yahan likha hai — aur aage kya banaya ja sakta hai wo bhi.

**Points to emphasise:**

- Limitations bolna academic honesty hai, weakness nahi.
- Koi fake performance ya production claim nahi.
- Future enhancements current gaps se directly judte hain.

**Possible faculty questions:**

- Sabse bada limitation kya hai? — Live AI fully credential-dependent hai aur real production run abhi verify nahi hua.
- Guest link security kaise improve karoge? — Single-use tokens, host admission aur email-bound invites se.

---

## Slide 24 — Conclusion

**What is displayed:** Thesis statement, three contribution blocks, and a closing scope statement.

**Speaking script (Hinglish):**

> Sir, nishkarsh ye hai ki Apex Agent dikhata hai ki student team modern web engineering, real-time media aur applied AI ko ek coherent product mein combine kar sakti hai. Meeting sirf bhooli hui recording nahi rehti — wo structured, searchable aur actionable knowledge ban jati hai. Technical contribution hai typed tRPC/Drizzle core, signed webhook handling, durable Inngest analysis aur honest failure states. Practical usefulness hai summaries, decisions, actions, talk time, Ask AI, reminders aur exports. Learning outcomes hai full-stack TypeScript, auth, real-time infrastructure, LLM integration, prompt engineering, background jobs, testing aur system design. Ant mein — ye ek evidence-backed final year project hai, koi speculative demo nahi.

**Simple technical explanation:**

Project ne kya prove kiya — modern stack se ek real, useful system banta hai jo meetings ko knowledge mein badalta hai.

**Points to emphasise:**

- Evidence-backed implementation ka point faculty ko zaroor batayein.
- Learning outcomes technically broad hain.
- Line 'not a speculative demo' closing tone set karti hai.

**Possible faculty questions:**

- Project se aapne kya seekha? — Full-stack TypeScript, real-time systems, LLM integration, background jobs aur testing.
- Agar dobara banate to kya badalte? — Test coverage aur role-based access ko pehle se design karte.

---

## Slide 25 — References

**What is displayed:** Fifteen IEEE-style references: two DOI-verified research works, official framework/API docs and standards.

**Speaking script (Hinglish):**

> Sir, references IEEE style mein hain. Pehle do research papers hain — Carletta et al. ka AMI meeting corpus paper, 2006, DOI 10.1007/11677482_3, aur Nenkova aur McKeown ka Automatic Summarization survey, 2011, DOI 10.1561/1500000015. Dono DOIs Crossref se verify kiye gaye hain. Baaki official documentation hai — Next.js, tRPC, Drizzle, Better Auth, Stream, Inngest, OpenAI, PostgreSQL, W3C WebRTC, MDN Web Speech, Stripe aur Resend. Standards aur docs ka access date 20 November 2026 rakha hai. Online product comparisons high-level hain aur unhe literature review slide mein clearly mark kiya gaya hai.

**Simple technical explanation:**

Saare sources authentic hain — papers ke DOI verify kiye, baaki official docs ke links diye hain with access date.

**Points to emphasise:**

- Dono research DOIs Crossref se verify hue.
- Product docs official sources se hain.
- Koi fabricated citation nahi hai.

**Possible faculty questions:**

- AMI paper ka DOI kya hai? — 10.1007/11677482_3.
- Access date kyun diya? — IEEE style mein online resources ke liye required hota hai.

---

## Slide 26 — Thank You / Q&A

**What is displayed:** Closing slide: Thank You, Questions & Answers, tagline, team names, editable guide/session placeholders.

**Speaking script (Hinglish):**

> Sir, bas itna hi. Apex Agent — One Platform. Smarter Work. Humari team ke teen members hain — Abhinav, Aman aur Swati. Main aapke sawalon ke liye tayyar hoon. Guide aur session ke placeholders yahan bhi editable rakhe hain, main unhe fill kar ke final version submit karunga. Thank you.

**Simple technical explanation:**

Closing slide hai — thank you, tagline, team, aur Q&A ke liye invitation.

**Points to emphasise:**

- Guide/session placeholders final version mein fill karein.
- Confidence ke saath Q&A lene ke liye tayyar rahein.
- Viva question bank is presentation ke saath attach hai.

**Possible faculty questions:**

- Agar faculty AI pipeline ya limits ke baare mein pooche? — Slide 18 aur 23 par clear, evidence-based answers hain.
- Koi accuracy doubt ho? — Viva bank mein 50+ questions aur answers hain, sab code ke according.

---

