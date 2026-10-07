import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core'
import type { DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useWorkbench } from '../stores/workbench'
import { zoomCollisionDetection, zoomModifier, zoomMeasuring, zoomTransform } from '../utils/dnd'
import type { TodoItem } from '../types'

function SortableTodoItem({
  todo,
  editing,
  checked,
  onToggle,
  onEdit,
  onRemove,
  onEditKeydown,
  onEditBlur,
  autoResize
}: {
  todo: TodoItem
  editing: boolean
  /** 勾选视觉（含乐观勾选过渡态），与分组归属解耦：点击后先打勾、稍后才移入已完成 */
  checked: boolean
  onToggle: (id: string) => void
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  onEditKeydown: (e: React.KeyboardEvent<HTMLTextAreaElement>, todo: TodoItem) => void
  onEditBlur: (e: React.FocusEvent<HTMLTextAreaElement>, todo: TodoItem) => void
  autoResize: (e: React.FormEvent<HTMLTextAreaElement>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: editing
  })
  const style = {
    transform: CSS.Transform.toString(zoomTransform(transform)),
    transition,
    opacity: isDragging ? 0 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`todo-item ${checked ? 'done' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="todo-check" onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggle(todo.id)}>
        <svg viewBox="0 0 12 12" width="11" height="11">
          <path d="M2.5 6.5L5 9l4.5-6" fill="none" stroke="var(--primary-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {editing ? (
        <textarea
          className="todo-edit-input"
          data-id={todo.id}
          defaultValue={todo.title}
          rows={1}
          onInput={autoResize}
          onKeyDown={(e) => onEditKeydown(e, todo)}
          onBlur={(e) => onEditBlur(e, todo)}
        />
      ) : (
        <div className="todo-text" onClick={() => onEdit(todo.id)}>
          {todo.title}
        </div>
      )}
      <button className="todo-del" onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemove(todo.id)}>
        <svg viewBox="0 0 14 14" width="13" height="13">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default function TodoPanel({ width }: { width?: number }) {
  const todos = useWorkbench((s) => s.todos)
  const editingTodoId = useWorkbench((s) => s.editingTodoId)
  const setEditingTodo = useWorkbench((s) => s.setEditingTodo)
  const addTodo = useWorkbench((s) => s.addTodo)
  const toggleTodo = useWorkbench((s) => s.toggleTodo)
  const updateTodo = useWorkbench((s) => s.updateTodo)
  const removeTodo = useWorkbench((s) => s.removeTodo)
  const reorderTodos = useWorkbench((s) => s.reorderTodos)

  const [input, setInput] = useState('')
  const currentProjectId = useWorkbench((s) => s.currentProjectId)
  const activeNav = useWorkbench((s) => s.activeNav)

  // 本地排序列表：拖拽时实时重排，松手后持久化
  const [items, setItems] = useState<TodoItem[]>(todos)
  useEffect(() => {
    setItems(todos)
  }, [todos])

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // 乐观勾选过渡态：点击复选框立即打勾，稍后落盘并移入已完成
  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set())

  const handleToggle = (id: string) => {
    setCheckedSet((prev) => new Set(prev).add(id))
    setTimeout(() => {
      toggleTodo(id)
      setCheckedSet((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 400)
  }

  const undone = items.filter((t) => !t.completed && t.title.trim() !== '')
  const done = items.filter((t) => t.completed && t.title.trim() !== '')
  const activeTodo = items.find((t) => t.id === activeId) ?? null

  useEffect(() => {
    if (editingTodoId) {
      const el = document.querySelector<HTMLTextAreaElement>(
        `.todo-edit-input[data-id="${editingTodoId}"]`
      )
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        el.style.height = 'auto'
        el.style.height = el.scrollHeight + 'px'
      }
    }
  }, [editingTodoId])

  const autoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const onAdd = () => {
    const v = input.trim()
    if (!v) return
    addTodo(v)
    setInput('')
  }

  const onEditKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>, todo: TodoItem) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const v = e.currentTarget.value.trim()
    // 回车仅保存当前待办并退出编辑，不再自动创建空待办行
    if (v) updateTodo(todo.id, v)
    else if (todo.title === '') removeTodo(todo.id)
    setEditingTodo(null)
  }

  const onEditBlur = (e: React.FocusEvent<HTMLTextAreaElement>, todo: TodoItem) => {
    const v = e.currentTarget.value.trim()
    if (v) updateTodo(todo.id, v)
    else if (todo.title === '') removeTodo(todo.id)
    setEditingTodo(null)
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    document.body.classList.add('is-dragging')
  }

  // 拖拽经过同组其他项时实时重排；跨组（未完成↔已完成）忽略
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const a = items.find((t) => t.id === active.id)
    const o = items.find((t) => t.id === over.id)
    if (!a || !o || a.completed !== o.completed) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id)
      const newIndex = prev.findIndex((t) => t.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const onDragEnd = () => {
    setActiveId(null)
    document.body.classList.remove('is-dragging')
    const undoneIds = items.filter((t) => !t.completed).map((t) => t.id)
    const doneIds = items.filter((t) => t.completed).map((t) => t.id)
    reorderTodos([...undoneIds, ...doneIds])
  }

  const onDragCancel = () => {
    setActiveId(null)
    document.body.classList.remove('is-dragging')
  }

  const itemProps = {
    editingTodoId,
    onToggle: handleToggle,
    onEdit: setEditingTodo,
    onRemove: removeTodo,
    onEditKeydown,
    onEditBlur,
    autoResize
  }

  return (
    <aside className="todo-panel" style={{ width }}>
      <div className="todo-head">
        待办事项 <span className="count">{undone.length} 未完成</span>
      </div>
      <div className="todo-add">
        <input
          className="todo-input"
          placeholder={currentProjectId ? '添加待办事项，回车确认' : activeNav === 'project' ? '选择项目后可添加待办事项' : '待办事项仅项目模式下可用'}
          value={input}
          disabled={!currentProjectId}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd()
          }}
        />
      </div>
      <div className="todo-list">
        {undone.length === 0 && done.length === 0 && (
          <div className="todo-empty">暂无待办事项，从上面输入开始添加</div>
        )}
        <DndContext
          sensors={sensors}
          measuring={zoomMeasuring}
          collisionDetection={zoomCollisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          {undone.length > 0 && (
            <div className="todo-group">
              <div className="todo-group-title">未完成</div>
              <SortableContext items={undone.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {undone.map((t) => (
                  <SortableTodoItem
                    key={t.id}
                    todo={t}
                    editing={editingTodoId === t.id}
                    checked={checkedSet.has(t.id)}
                    {...itemProps}
                  />
                ))}
              </SortableContext>
            </div>
          )}
          {done.length > 0 && (
            <div className="todo-group">
              <div className="todo-group-title">已完成</div>
              <SortableContext items={done.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {done.map((t) => (
                  <SortableTodoItem
                    key={t.id}
                    todo={t}
                    editing={editingTodoId === t.id}
                    checked={!checkedSet.has(t.id)}
                    {...itemProps}
                  />
                ))}
              </SortableContext>
            </div>
          )}
          <DragOverlay modifiers={[zoomModifier]}>
            {activeTodo ? (
              <div className={`todo-item dragging-overlay ${activeTodo.completed ? 'done' : ''}`}>
                <div className="todo-check">
                  <svg viewBox="0 0 12 12" width="11" height="11">
                    <path d="M2.5 6.5L5 9l4.5-6" fill="none" stroke="var(--primary-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="todo-text">{activeTodo.title}</div>
                <button className="todo-del" style={{ opacity: 0 }} tabIndex={-1}>
                  <svg viewBox="0 0 14 14" width="13" height="13">
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </aside>
  )
}
