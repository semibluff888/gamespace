import { escapeHtml as esc } from './listMarkup.js';

/**
 * 观测站控制台（按 ~ 呼出）。命令由外部注入：
 *   commands: { name: { desc, usage?, hidden?, run(args, io) } }
 *   complete(word, index): 返回补全候选
 */
export function createTerminal(root, { commands, complete, onOpenChange, sound }) {
  const log = root.querySelector('.terminal__log');
  const form = root.querySelector('.terminal__form');
  const input = root.querySelector('.terminal__input');
  const history = [];
  let hIndex = -1;
  let isOpen = false;
  let greeted = false;

  const io = {
    print(text = '', cls = '') {
      const line = document.createElement('div');
      if (cls) line.className = cls;
      line.textContent = text;
      log.append(line);
      log.scrollTop = log.scrollHeight;
    },
    html(markup) {
      const line = document.createElement('div');
      line.innerHTML = markup;
      log.append(line);
      log.scrollTop = log.scrollHeight;
    },
    clear() {
      log.innerHTML = '';
    },
    close: () => close(),
  };

  function greet() {
    io.print('SEMIBLUFF DEEP-SPACE ARRAY · OPERATOR CONSOLE', 't-hi');
    io.print('输入 help 查看可用命令。Tab 补全，↑↓ 历史记录。', 't-dim');
  }

  function run(line) {
    const raw = line.trim();
    if (!raw) return;
    history.unshift(raw);
    if (history.length > 40) history.pop();
    hIndex = -1;
    io.html(`<span class="t-cmd"><b>›</b> ${esc(raw)}</span>`);
    const [name, ...args] = raw.split(/\s+/);
    const key = name.toLowerCase();
    const cmd = commands[key];
    if (!cmd) {
      io.print(`未知命令：${name}。输入 help 查看可用命令。`, 't-err');
      sound?.('deny');
      return;
    }
    try {
      cmd.run(args, io, raw);
    } catch (err) {
      io.print(`执行出错：${err?.message || err}`, 't-err');
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    run(v);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === '`' || e.key === '~' || e.code === 'Backquote') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIndex < history.length - 1) hIndex++;
      input.value = history[hIndex] ?? input.value;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIndex > 0) hIndex--;
      else {
        hIndex = -1;
        input.value = '';
        return;
      }
      input.value = history[hIndex] ?? '';
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.value.split(/\s+/);
      const idx = parts.length - 1;
      const word = parts[idx] || '';
      const pool = idx === 0 ? Object.keys(commands).filter((k) => !commands[k].hidden) : complete(word, idx, parts[0]);
      const hits = pool.filter((c) => c.startsWith(word.toLowerCase()));
      if (hits.length === 1) {
        parts[idx] = hits[0];
        input.value = `${parts.join(' ')} `;
      } else if (hits.length > 1) {
        io.print(hits.join('    '), 't-dim');
      }
      return;
    }
    if (e.key.length === 1) sound?.('key');
    e.stopPropagation();
  });

  function open() {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    if (!greeted) {
      greet();
      greeted = true;
    }
    requestAnimationFrame(() => {
      root.classList.add('is-open');
      input.focus({ preventScroll: true });
    });
    onOpenChange?.(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    input.blur();
    setTimeout(() => {
      if (!isOpen) root.hidden = true;
    }, 360);
    onOpenChange?.(false);
  }

  return {
    open,
    close,
    toggle() {
      if (isOpen) close();
      else open();
    },
    run,
    get isOpen() {
      return isOpen;
    },
  };
}
