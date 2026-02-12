Multiple focuses:

- when arrowing up/down, use as starting point the last focused row among all the focused rows
- scroll to focused row only if selected it (aka unselecting it doesn't scroll)

Current differences vs native/fixing native

- deleting a row doesn't lose existing (potentially multi-) selections (imagine deleting a pivot)
- concurrent click + keypress
- selection hole punching isn't great, think about improvements
- keyboard nagivation with hole punching also isn't great
- scroll -> focus on a different row properly stops scrolling (edit: safari bug really)
- no caching

Design decisions

- you can either mutate your existing collection or use a standalone one you sync yourself

don't forget to adjust when rows change
