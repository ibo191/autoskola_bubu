import source from '../content/faq-source.md?raw';

export type FaqItem = { question: string; answer: string };
export type FaqGroup = { title: string; items: FaqItem[] };

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function removeBoldMarkers(value: string) {
  return value.replace(/\*\*(.+?)\*\*/g, '$1');
}

function formatAnswer(value: string) {
  const lines = value.trim().split(/\n{2,}/);
  return lines
    .map((block) => {
      const text = escapeHtml(removeBoldMarkers(block)).replace(/\n/g, '<br />');
      if (block.split('\n').every((line) => /^\* /.test(line))) {
        return `<ul>${block
          .split('\n')
          .map((line) => `<li>${escapeHtml(removeBoldMarkers(line.replace(/^\* /, '')))}</li>`)
          .join('')}</ul>`;
      }
      if (/^\d+\. /.test(block)) {
        return `<ol>${block
          .split('\n')
          .map((line) => `<li>${escapeHtml(removeBoldMarkers(line.replace(/^\d+\. /, '')))}</li>`)
          .join('')}</ol>`;
      }
      return `<p>${text}</p>`;
    })
    .join('');
}

function parseFaqGroups() {
  const groups: FaqGroup[] = [];
  let active: FaqGroup | undefined;
  let question = '';
  let answer: string[] = [];
  for (const line of source.replace(/\r/g, '').split('\n')) {
    if (line.trim() === '---') {
      continue;
    } else if (line.startsWith('# ')) {
      if (active && question)
        active.items.push({ question, answer: formatAnswer(answer.join('\n')) });
      active = { title: line.slice(2), items: [] };
      groups.push(active);
      question = '';
      answer = [];
    } else if (line.startsWith('## ')) {
      if (active && question)
        active.items.push({ question, answer: formatAnswer(answer.join('\n')) });
      question = line.slice(3);
      answer = [];
    } else if (active && question) {
      answer.push(line);
    }
  }
  if (active && question) active.items.push({ question, answer: formatAnswer(answer.join('\n')) });
  return groups;
}

export const faqGroups = parseFaqGroups();
