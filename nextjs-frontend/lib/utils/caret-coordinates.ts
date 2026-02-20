/**
 * 获取 textarea 中光标位置的坐标
 * 
 * @param element - textarea 元素
 * @param position - 光标位置（字符索引）
 * @returns 光标相对于 textarea 的坐标 {top, left}
 */
export function getCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const text = element.value.substring(0, position);
  const lines = text.split('\n');
  const currentLine = lines.length - 1;
  const currentColumn = lines[currentLine].length;

  // 获取计算后的样式
  const computedStyle = window.getComputedStyle(element);
  const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
  const fontSize = parseFloat(computedStyle.fontSize) || 14;
  const fontFamily = computedStyle.fontFamily || 'sans-serif';
  const paddingTop = parseFloat(computedStyle.paddingTop) || 12;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 12;

  // 创建隐藏的 div 来测量文本宽度
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre';
  div.style.fontFamily = fontFamily;
  div.style.fontSize = `${fontSize}px`;
  div.style.lineHeight = `${lineHeight}px`;
  div.style.padding = '0';
  div.style.margin = '0';
  div.style.top = '0';
  div.style.left = '0';

  // 设置文本内容并测量
  div.textContent = lines[currentLine] || ' ';
  document.body.appendChild(div);
  const textWidth = div.getBoundingClientRect().width;
  document.body.removeChild(div);

  // 计算坐标
  return {
    top: paddingTop + (currentLine * lineHeight),
    left: paddingLeft + textWidth,
  };
}

/**
 * 获取光标在页面中的绝对坐标
 * 
 * @param element - textarea 元素
 * @param position - 光标位置（字符索引）
 * @returns 光标相对于视口的坐标 {top, left}
 */
export function getCaretAbsoluteCoordinates(
  element: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const relativeCoords = getCaretCoordinates(element, position);
  const rect = element.getBoundingClientRect();

  return {
    top: rect.top + relativeCoords.top,
    left: rect.left + relativeCoords.left,
  };
}
