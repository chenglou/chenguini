export type HNCommentDoc = {
  blocks: HNBlock[]
}

export type HNBlock =
  | {kind: 'paragraph'; runs: HNRun[]}
  | {kind: 'codeBlock'; text: string}

export type HNRun =
  | {kind: 'text'; text: string}
  | {kind: 'italic'; text: string}
  | {kind: 'link'; text: string; href: string}

export function parseHNCommentHTML(commentHTML: string): HNCommentDoc {
  const template = document.createElement('template')
  template.innerHTML = commentHTML

  const blocks: HNBlock[] = []
  let currentParagraphRuns: HNRun[] = []

  for (const node of template.content.childNodes) {
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        addRun(currentParagraphRuns, {kind: 'text', text: node.textContent ?? ''})
        break

      case Node.ELEMENT_NODE:
        if (!(node instanceof HTMLElement)) break

        switch (node.tagName) {
          case 'P':
            pushParagraphBlock(blocks, currentParagraphRuns)
            currentParagraphRuns = []
            pushElementParagraphBlock(blocks, node)
            break

          case 'PRE':
            pushParagraphBlock(blocks, currentParagraphRuns)
            currentParagraphRuns = []
            pushCodeBlock(blocks, node)
            break

          case 'A':
            if (!(node instanceof HTMLAnchorElement)) throw new Error('Expected <a> to be HTMLAnchorElement')
            addRun(currentParagraphRuns, parseLinkRun(node))
            break

          case 'I':
            addRun(currentParagraphRuns, {kind: 'italic', text: node.textContent})
            break

          default:
            throw new Error(`Unsupported HN root tag <${node.tagName.toLowerCase()}>`)
        }
        break

      default:
        break
    }
  }

  pushParagraphBlock(blocks, currentParagraphRuns)
  return {blocks}
}

export function hnCommentDocToPlainText(doc: HNCommentDoc, blockSeparator = ''): string {
  return doc.blocks
    .map(block =>
      block.kind === 'paragraph'
        ? block.runs.map(run => run.text).join('')
        : block.text,
    )
    .join(blockSeparator)
}

export function renderHNCommentDoc(doc: HNCommentDoc): DocumentFragment {
  const fragment = document.createDocumentFragment()

  for (let blockIndex = 0; blockIndex < doc.blocks.length; blockIndex++) {
    const block = doc.blocks[blockIndex]!
    switch (block.kind) {
      case 'paragraph':
        if (blockIndex === 0) appendRuns(fragment, block.runs)
        else {
          const paragraph = document.createElement('p')
          appendRuns(paragraph, block.runs)
          fragment.appendChild(paragraph)
        }
        break

      case 'codeBlock': {
        const codeBlock = document.createElement('pre')
        codeBlock.textContent = block.text
        fragment.appendChild(codeBlock)
        break
      }
    }
  }

  return fragment
}

function pushElementParagraphBlock(blocks: HNBlock[], paragraphElement: HTMLElement) {
  const runs = parseParagraphRuns(paragraphElement.childNodes)
  if (runs.length > 0) blocks.push({kind: 'paragraph', runs})
}

function parseParagraphRuns(nodes: NodeListOf<ChildNode> | ChildNode[]): HNRun[] {
  const runs: HNRun[] = []

  for (const node of nodes) {
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        addRun(runs, {kind: 'text', text: node.textContent ?? ''})
        break

      case Node.ELEMENT_NODE:
        if (!(node instanceof HTMLElement)) break

        switch (node.tagName) {
          case 'A':
            if (!(node instanceof HTMLAnchorElement)) throw new Error('Expected <a> to be HTMLAnchorElement')
            addRun(runs, parseLinkRun(node))
            break

          case 'I':
            addRun(runs, {kind: 'italic', text: node.textContent})
            break

          default:
            throw new Error(`Unsupported HN inline tag <${node.tagName.toLowerCase()}>`)
        }
        break

      default:
        break
    }
  }

  trimParagraphRuns(runs)
  return runs
}

function pushCodeBlock(blocks: HNBlock[], preElement: HTMLElement) {
  const text = preElement.textContent
  if (text !== '') blocks.push({kind: 'codeBlock', text})
}

function parseLinkRun(linkElement: HTMLAnchorElement): HNRun {
  return {
    kind: 'link',
    href: linkElement.href,
    text: linkElement.textContent,
  }
}

function addRun(runs: HNRun[], next: HNRun) {
  const text = normalizeInlineWhitespace(next.text)
  if (text === '') return

  const previous = runs[runs.length - 1]
  if (previous == null) {
    runs.push({...next, text})
    return
  }

  if (previous.kind === next.kind) {
    if (previous.kind === 'link' && next.kind === 'link' && previous.href !== next.href) {
      runs.push({...next, text})
      return
    }

    previous.text += text
    return
  }

  runs.push({...next, text})
}

function pushParagraphBlock(blocks: HNBlock[], runs: HNRun[]) {
  trimParagraphRuns(runs)
  if (runs.length > 0) blocks.push({kind: 'paragraph', runs})
}

function trimParagraphRuns(runs: HNRun[]) {
  while (runs.length > 0) {
    const first = runs[0]!
    first.text = first.text.replace(/^\s+/, '')
    if (first.text !== '') break
    runs.shift()
  }

  while (runs.length > 0) {
    const last = runs[runs.length - 1]!
    last.text = last.text.replace(/\s+$/, '')
    if (last.text !== '') break
    runs.pop()
  }
}

function normalizeInlineWhitespace(text: string) {
  return text.replace(/\s+/g, ' ')
}

function appendRuns(parent: DocumentFragment | HTMLElement, runs: HNRun[]) {
  for (const run of runs) {
    switch (run.kind) {
      case 'text':
        parent.appendChild(document.createTextNode(run.text))
        break

      case 'italic': {
        const italic = document.createElement('i')
        italic.textContent = run.text
        parent.appendChild(italic)
        break
      }

      case 'link': {
        const link = document.createElement('a')
        link.href = run.href
        link.textContent = run.text
        parent.appendChild(link)
        break
      }
    }
  }
}
