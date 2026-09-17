# Hackathon context — First Commit (WeMakeDevs × AWS, Bharat Builds Tour)

Read this before anything else. It governs what "done" means and what is disqualifying.

## Event facts

- Event: WeMakeDevs × AWS **First Commit**, part of the Bharat Builds Tour.
- Online: **Thu 17 – Sun 20 Sept 2026**, anywhere in India. Optional in-person day Sat 19 Sept
  at Polaris School of Technology, Bangalore (adds nothing to score, just workshops/feedback).
- Kickoff: **17 Sept, 4:00 PM**. Submission deadline: not yet published — check the
  [schedule page](https://www.wemakedevs.org/aws/first-commit/schedule) and update this file
  the moment it's announced.
- Team: up to 4 people, plus one member also handling infra/deploy coordination.

## Tracks — read this carefully, it changes the architecture

There are **two tracks and a cross-cutting design prize**. You don't pick a track; the judges
place your submission based on what you built. **One submission can be considered for
multiple tracks.**

- **Build It** (2nd prize, ₹1,50,000 + $2,000 AWS credits): open-source AWS stack running
  **locally** — Strands Agents SDK on **local models**, PartyRock, Cedar, SAM CLI + LocalStack,
  OpenSearch/Firecracker/Corretto. **No AWS account, no card, no bill.**
- **Ship It** (1st prize, ₹2,00,000 + $3,000 AWS credits): **deployed live on AWS** with a URL —
  Lambda, API Gateway, DynamoDB, S3, Bedrock, Amplify Hosting/App Runner, Cognito, EventBridge,
  Step Functions. Architecture and cost decisions are part of the score.
- **Best UI** (3rd prize, ₹1,00,000 + $1,000 AWS credits): open to a project from either track,
  judged purely on design/usability.

**This project is a Ship It project.** We deploy on real AWS and use Bedrock (a managed cloud
model, not a local model), so it cannot also qualify as Build It even though we use Strands
(which appears on both lists). Confirmed this reading is being double-checked with organizers
on Discord — if they say otherwise, this file gets updated, don't assume.

**Practical effect:** architecture cleanliness and cost story matter for scoring, not just
"does it work." Keep the AWS diagram slide honest and simple in the demo video.

## What counts as "using AWS" for judging

> "Your project has to use AWS, and your demo video has to show it. Naming AWS in the
> writeup alone is not enough."

The video must visibly show the AWS-backed product working (login, a deployed URL, live data),
not just a slide claiming AWS was used.

## The clock rule — disqualification risk

> "Start building when the hackathon opens... Old projects do not count. Build something new
> once the clock starts... a repository whose history does not match the event dates
> disqualifies the whole team."

This is why nothing was created in this repo before 17 Sept 4:00 PM. All commit history from
here on should look like it happened during the event window. Don't backdate, don't reuse
pre-event branches/code from other repos.

Planning, architecture research, and reading docs *before* the clock started is explicitly
allowed and encouraged — that's what the parent conversation (outside this repo) was for.
Implementation work starts now.

## Judging criteria (weight roughly equal, unconfirmed exact %)

1. **Idea and impact** — real problem, real change for the user.
2. **Built on AWS** — mandatory to win any prize; Ship It scores architecture/cost explicitly.
3. **Learning** — the writeup must say what the team learned this weekend.
4. **Execution** — "One feature that runs beats five that almost do." No live demo, only the
   submitted video — a feature invisible in the video does not count for judging.
5. **Demo video** — max 3 minutes, recorded. This is what judges see. No live Q&A.

## Submission package (per team, one submission)

- Public GitHub repository.
- Working deployed URL (Amplify frontend).
- Demo video, ≤ 3 minutes.
- Short writeup: problem, implementation, AWS usage, what was learned, AI tools used (must
  disclose Claude Code / Codex / Gemini usage).
- Submit early, keep editing until the deadline — **once the deadline passes you cannot edit or
  submit**. Aim to have a rough submission in by Saturday night as insurance.

## Extra prizes worth going for cheaply

- **Top 5 blogs** (Logitech keyboard each): publish a build writeup on AWS Builder Center,
  link it in the submission. Reuses the writeup content — near-zero extra cost.
- **4 runners-up** ($1,000 AWS credits each): automatic if you submit, no extra entry needed.
- **Fast-track Amazon interview** (top 10 projects, Pre-Final/Final year students only): judged
  separately from prizes, no guarantee, don't design around it — but don't actively hurt it
  either (see [rules](https://www.wemakedevs.org/aws/first-commit/rules) §06/§08 for exact terms).

## Prerequisites (should already be done before kickoff)

- Every team member: WeMakeDevs account, checked in to First Commit, **AWS Builder Center
  profile with student status verified**. Without this the fast-track eligibility and possibly
  entry itself is incomplete — verify today if not already done.
- AWS account with **Budget alerts set** (see [architecture.md](architecture.md#cost-control)).
- $100/team AWS credit code issued by organizers before the event — check Billing → Credits,
  don't assume any specific amount.

## Sources (re-check if anything here seems stale)

- https://www.wemakedevs.org/aws/first-commit
- https://www.wemakedevs.org/aws/first-commit/rules
- https://www.wemakedevs.org/aws/first-commit/schedule
