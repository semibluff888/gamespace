/** HUD 风格的短消息 */
export function createToasts(root) {
  const MAX = 3;
  function show({ k, v = '', tone = '', duration = 2800, action } = {}) {
    const el = document.createElement('div');
    el.className = `toast${tone ? ` toast--${tone}` : ''}`;
    const key = document.createElement('span');
    key.className = 'toast__k';
    key.textContent = k;
    el.append(key);
    if (v) {
      const val = document.createElement('span');
      val.className = 'toast__v';
      val.textContent = v;
      el.append(val);
    }
    let timer = 0;
    const remove = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 360);
    };
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast__btn';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.run();
        remove();
      });
      el.append(btn);
    }
    root.append(el);
    while (root.children.length > MAX) root.firstElementChild.remove();
    timer = setTimeout(remove, duration);
    return remove;
  }
  return { show };
}
