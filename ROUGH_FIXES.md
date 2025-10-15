Error with a massive number of in text citation links being returned like [1][2][3][4][5][13][15][17][19][20][21][24][25][26][27][28][29]. The citation numbers are meant to represent the chunks so when they are clicked the proper chunk is served. There should only be as many citations as are used in the answer. I am open to refining this in a more intuitive way for the user but there should ideally only be a maximum of 3 or so citations per answer. 

During chunking, store what section or sub section each chunk resides in this way we can easily create study guides by structuring it for each section and sub section. I am open to what method we use to do this, it could be some type of semantic section clusterer that groups sections that likely exist together or it could be more of a markdown based chapter/section grouper during chunking however this seems too dependent on document structure that may vary.

add native doc summary (md formatted) to the doc chat page so user can toggle between summary and doc in the document viewer 

Have study guide gen, summary gen, and quote finding be their own type of responses in the chat window kinda like how chat gpt does deep research or living documents, formatted differently than normal answers. The main goal of this is to show the user that these are their own independent functions but they should still live in the chat.

Maybe have an agent or part of chain that has summary and part that has specific retrieval so that summary can be a fallback. For instance, if no chunks are returned from RAG, the agent can fall back on the summary (it may already work like this).

Extend that idea to feed summary to agent when direct retrieval is below a certain threshold 
add an agent in the chain that keeps track of/pulls from memory about user knowledge and writes updates when necessary (this is just an idea, let's refine this more so it makes more sense)

Ensure the system is using modern Context engineering methods and setup to use graph rag and is agentic. Should be industry standard while fitting into the constraints and unique usecase of the app

Maybe add some type of LLM based reranking system.

move towards graph Rag instead of vector db

Fix the occasional error where Markdown is not processing formulas and how they load in in red or expand the doc chat screen

General UI cleanup and updates. Ensure it is set to fit all screen sizes well. Change UI/UX to have class tabs in the sidebar that can be toggled through a dropdown menu and then each of these tabs includes the docs, chats, and optionally saved study guides, notes, and summaries as living documents the user can edit. Potentially keep the chats section that displays all chats regardless of class for easy nav (maybe recent chats or something with an identifier somewhere that shows which chat is from which class).

Add os.getenv centralization

All that really needs to happen if there is a no hit is the LLM should keep asking the user to be more specific and maybe send some suggested query refinements to the user until the similarity score is above the requirement. Let's explore the tradeoffs and UX between this and the LLM just answering without asking for refinement. Maybe add a way to toggle these settings for power users. 

Fix the issues with the confirm email link, it should autoreload when clicked even on another device and should have a link to chat page (this may work already).

Need to add some context awareness for situations like “generate a study guide for a markov chain” when it is asked for a whole class because currently it just pulls the summaries for the whole class. Let's explore options for this and refine. 

The signup password validator toast errors are thrown to the login page too, I guess this isn’t much of an issue because any account made will have those validators satisfied. 

Add a login validator that only allows a certain amount of login attempts before reset password link is sent or before the user is prompted for this. 

Generally refine the signup and login pages/validators to be industry standard. 

Setup reset password link (may already be setup). 

Fix python logger so logs other than info come in properly and fix node logger to make look better, both loggers should have user id and other ids associated with stuff to aid in easy lookup. Let's use the most industry standard and searchable log system that works well with the project build. 

Follow up query is not being hit for some things like “elaborate on this” followed by a specific request like “elaborate on how this pertains to the industrial revolution”. 
Works for basic “elaborate on this” requests.

Fix the navigate home to chat after email confirm link, add a link that appears after confirmation that says something like “go to chat” (only if autoredirect is still causing problems). 

For router do something like:
If two separate regex routers are hit then do a second semantic router or LLM filter 
Context gathering initial agent 

Format study guides better adding a strict question and answer structure 

Add rate limiting guardrail to semantic search and do some general prompt fixing and speed optimization 

Ensure that if user confirms email on phone it just shows a mobile email confirm page that doesn’t let them go to the chat page

Instead of the queries like generate study guide or create notes do this: 
In addition to summarizing each doc have an LLM come up with 5 or so questions that would be good for this document (this is just an idea, if it is too heavy or if there are better options let's go with that)
Add those with the chunks like the summary chunk and embed it 
Serve this or a mix of these from class docs as the suggested queries

If there is a No hit for the similarity search on a response have the LLM respond with directions on how to structure a query based on their specific query
This can be done by having a standard instructions prompt that is fed to it along with the query that contains how to instruct the user for specific use cases 
We could also just update the standard response to be more comprehensive 

Doc chat window still expands when long formula is typed, please fix so the doc chat window stays the same size always (it may already work like this). 

Use react joyride for onboarding walkthrough

Make sure free plan doc count does not clear after deletion and only chat count clears monthly

Make delete account go clear everything under that user ID and block it with an are you sure message

Add validators to profile page email and password changes and add email link to these with mailgun

Clean up all unused imports to help memory especially on backend 

Need to fix the rate limiting issue, options: 
Increase rate limit in account through open ai 
Setup multiple projects under the same billing org and use different api keys 
Ideally have a redis bucket that keeps track of tokens, once it gets close to limit it switches the requests to a 2nd or 3rd API key under a different project (we already have this on some level)

Add delete account functionality

Block web app entirely on mobile and serve something like “go to browser”

Ensure that summaries are excluded from the normal semantic search for specific questions

Must verify app with google OAuth before pushing to prod (simple setup in OAuth account)

Add more doc types other than pdfs (DOC, .DOCX, powerpoint)

Add OCR for handwritten/images of files 