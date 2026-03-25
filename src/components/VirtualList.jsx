import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Simple virtual scrolling list. Only renders items visible in the viewport + buffer.
 * @param {Array} items - all items to render (flat array including group headers)
 * @param {number} itemHeight - estimated height per item (px)
 * @param {number} overscan - number of extra items to render above/below (default 10)
 * @param {Function} renderItem - (item, index) => React element
 * @param {Object} containerStyle - optional additional styles for the scroll container
 */
export default function VirtualList({ items, itemHeight = 44, overscan = 10, renderItem, containerStyle }) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);

  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
      const observer = new ResizeObserver(entries => {
        setContainerHeight(entries[0].contentRect.height);
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length - 1, Math.floor((scrollTop + containerHeight) / itemHeight) + overscan);
  const offsetY = startIndex * itemHeight;

  const visibleItems = items.slice(startIndex, endIndex + 1);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: 'auto', ...containerStyle }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems.map((item, i) => renderItem(item, startIndex + i))}
        </div>
      </div>
    </div>
  );
}
