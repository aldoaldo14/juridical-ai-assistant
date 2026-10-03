<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Local-model calls go directly from the browser to user-configured OpenAI-compatible localhost endpoints (no fixed runtime); keeps documents on the user's machine.
- Projects, benchmark runs and results persist in localStorage (src/lib/store.ts); single-machine use, no cloud storage for private legal documents.
- PDF rendering uses pdfjs-dist via dynamic import in src/lib/pdf.ts; it must never load during SSR.
