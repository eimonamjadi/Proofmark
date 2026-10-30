# Proofmark

See exactly what an AI changed in your writing.

Paste your original text and the AI-edited version. Proofmark marks every change word by word, like a GitHub diff for prose: deletions in red strikethrough, insertions in green. You then accept or reject each change and copy out the result.

It is a static site with no build step and no dependencies, and nothing you paste leaves your browser.

## Features

- **Word-level changes.** Each change is shown inline in the sentence it belongs to, not as whole replaced lines.
- **Accept or reject each change.** After each decision it jumps to the next open change. Pressing Accept or Reject again reopens a change.
- **Diff stats.** A GitHub-style `+added −removed` word count, the number of changes, and how much of your original wording was kept.
- **Clean view.** Read the text with your decisions applied, without the markup.
- **Copy result.** Copies the final text. Changes you haven't decided on are copied as edited.
- **Keyboard review.** `J`/`K` move between changes, `A` accepts, `R` rejects.
- **Private.** Everything runs locally. Your last two texts are saved only in your own browser's local storage.

## Why not a normal diff?

Line-based tools like `git diff` treat a whole paragraph as one line, so changing one word marks the entire paragraph as replaced. Proofmark is built for prose:

1. **Paragraphs are aligned first**, so a rewrite in one paragraph doesn't throw off the rest of the document.
2. **Each changed paragraph is then compared word by word** using the Myers diff algorithm (the same one git uses), on words and punctuation instead of lines.
3. **Whitespace inside a paragraph is ignored.** Extra spaces and hard line wraps, for example from text copied out of a PDF, are not counted as changes.
4. **Small unchanged gaps between two edits are merged.** You see `~~take time to appear~~ emerge only after a delay` as one change instead of a scatter of one-word fragments.

Paragraph breaks are normalized to a single blank line. A paragraph break that was added or removed shows as a `¶` mark.

## Tip: ask for edits that diff cleanly

Models often rephrase sentences that were already fine, which buries the real fixes. Adding something like this to your prompt keeps the list of changes short:

> Edit for clarity, grammar and concision. Make the smallest change that fixes each problem. Keep my wording and sentence structure wherever they already work, and don't rewrite sentences that are fine as they are.

## Run it locally

Open `index.html` in a browser. That's it.

To serve it instead (optional):

```sh
npm start          # serves the folder with `npx serve`
# or
python3 -m http.server 8000
```

## Tests

The diff logic lives in `diff.js` and has tests that use Node's built-in test runner (Node 18 or newer, no install needed):

```sh
npm test
```

## Project structure

```
index.html        Page markup
styles.css        Styles, including light and dark themes
app.js            UI: rendering, review controls, keyboard, copy
diff.js           Diff engine (paragraph alignment + word-level Myers diff)
test/             Tests for the diff engine
favicon.svg       Tab icon
.nojekyll         Tells GitHub Pages to serve files as-is
```

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, and click **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/<repo-name>/`.

## License

[MIT](LICENSE)
