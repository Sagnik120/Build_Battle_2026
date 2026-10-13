# Demo script (about 3 minutes)

One story: 7,000 raw reviews go in, a ranked and explained to-do list comes out.

| Time | Screen | Show | Say |
|---|---|---|---|
| 0:00 | Dashboard | The five numbers and the "In short" card | "A business has 7,000 reviews and no time to read them. InsightFlow reads them and says what to fix first." |
| 0:25 | Dashboard | Sentiment chart, then filter Category → Fraud and Scam | "Everything can be filtered, and the filter lives in the URL so a view can be shared." |
| 0:45 | Feedback | Search "refund", open one row, show sentiment, severity, theme and Adaption's root cause | "Every message is read for sentiment, severity and topic. Identical messages are analysed once: 7,000 rows are 317 distinct messages." |
| 1:05 | Feedback | Add feedback: type a new complaint, save | "New feedback gets an instant read, and is sent to Adaption automatically for the root cause. That job takes 10–20 minutes, so do this step first and come back to the message at the end of the demo." |
| 1:20 | Feedback | Import CSV: pick a small file, show the column auto-detection | "Any CSV works; columns are detected and can be remapped." |
| 1:35 | Priorities | Top card: score, the three factors, reasons, actions, customer quotes, revenue at risk | "Each problem gets a score out of 100 that you can argue with: reach, severity, and how many were left unresolved." |
| 2:00 | Priorities | The "Root-cause analysis by Adaption" block | "Adaption is the generative layer. It reads each distinct message and returns the likely root cause and a fix." |
| 2:10 | Adaption | The five steps, the exact prompt, the run list; then the Adaption website's dataset list | "The app de-duplicates, uploads, gets a credit quote, runs, and merges the result back by reference ID. 317 of 317 matched." |
| 2:35 | Priorities → Issues | Track issue, move it to In progress, set an owner | "Decide to act, and the issue keeps live complaint counts against the day you started." |
| 2:50 | Reports | Generate report, copy share link, open it in a private window | "A frozen report anyone can open by link, print to PDF, or export." |

## Answers worth having ready

- **Why not send all 7,000 rows to Adaption?** Only 317 are distinct. De-duplicating first cost 5 credits; 7,000 rows would cost many times that.
- **Why does Adaption show a grade change of −3%?** That is Adaption's grade of the dataset as text. InsightFlow asks for compact JSON, and the starting grade was already 10.0.
- **Why is there no growth figure on the sample?** The sample file has no dates. The app refuses to score a trend it cannot measure; import a file with dates and growth appears.
- **What runs without Adaption?** A rule-based engine gives instant sentiment, severity and themes; Adaption replaces its read per message when a run finishes.
- **How are similar messages grouped?** Known problems by a theme taxonomy; anything left over is clustered (TF-IDF + k-means) into "emerging" themes. Import a few new-style complaints to show one appear.
