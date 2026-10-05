import { closestCenter } from '@dnd-kit/core'
import type { ClientRect, CollisionDetection, MeasuringConfiguration, Modifier } from '@dnd-kit/core'
import type { Transform } from '@dnd-kit/utilities'

/** 当前界面的 CSS zoom（字号缩放），默认 1 */
export function getZoom(): number {
  return parseFloat(document.documentElement.style.zoom || '') || 1
}

/**
 * 关键约束：dnd-kit 的 sortable 内部 useDerivedTransform 硬编码调用 getClientRect（视觉坐标），
 * 因此 droppable 的 measure 必须保持默认（视觉），否则让位时被挤走的元素会「扭」。
 * 这里只把 draggable / dragOverlay 两个 measure 换算回布局坐标，
 * 让 DragOverlay 的 fixed 定位（布局坐标 × zoom 渲染）与落位动画（dropAnimation）在同一坐标系。
 */
function measureZoom(node: HTMLElement): ClientRect {
  const r = node.getBoundingClientRect()
  const zoom = getZoom()
  if (zoom === 1) {
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height }
  }
  return {
    top: r.top / zoom,
    left: r.left / zoom,
    bottom: r.bottom / zoom,
    right: r.right / zoom,
    width: r.width / zoom,
    height: r.height / zoom
  }
}

export const zoomMeasuring: MeasuringConfiguration = {
  draggable: { measure: measureZoom },
  dragOverlay: { measure: measureZoom }
}

/** 拖拽位移 transform 是视觉坐标，除以 zoom 换算回布局坐标，配合上面的 measureZoom 让跟随正确 */
export const zoomModifier: Modifier = ({ transform }) => {
  const zoom = getZoom()
  if (zoom === 1) return transform
  return { ...transform, x: transform.x / zoom, y: transform.y / zoom }
}

/**
 * 碰撞检测：draggingNodeRect（dragOverlay.measure 布局坐标）与 droppableRects（视觉坐标）坐标系不一致，
 * 这里把 collisionRect 换算回视觉坐标后再用 closestCenter，避免排序目标偏上。
 */
export const zoomCollisionDetection: CollisionDetection = (args) => {
  const zoom = getZoom()
  if (zoom === 1) return closestCenter(args)
  const { collisionRect, ...rest } = args
  const adjusted: ClientRect = {
    top: collisionRect.top * zoom,
    left: collisionRect.left * zoom,
    bottom: collisionRect.bottom * zoom,
    right: collisionRect.right * zoom,
    width: collisionRect.width * zoom,
    height: collisionRect.height * zoom
  }
  return closestCenter({ ...rest, collisionRect: adjusted })
}

/**
 * useSortable 返回的让位 transform（含 useDerivedTransform 的补偿）是视觉坐标，
 * 直接作为布局 transform 渲染会被 zoom 放大，导致让位位置偏大、被挤元素「轻微抖动」。
 * 这里除以 zoom 换算回布局坐标，让让位与补偿视觉正确。
 */
export function zoomTransform(transform: Transform | null): Transform | null {
  if (!transform) return transform
  const zoom = getZoom()
  if (zoom === 1) return transform
  return { ...transform, x: transform.x / zoom, y: transform.y / zoom }
}
