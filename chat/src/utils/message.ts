import Message from '@/components/Message/index.vue'
import { createVNode, render } from 'vue'

export interface MessageOptions {
  type?: 'success' | 'error' | 'warning' | 'info'
  content: string
  duration?: number
}

type MessageInstance = {
  success(content: string, options?: Partial<MessageOptions>): void
  error(content: string, options?: Partial<MessageOptions>): void
  warning(content: string, options?: Partial<MessageOptions>): void
  info(content: string, options?: Partial<MessageOptions>): void
  destroy(): void
}

let messageInstance: MessageInstance | null = null

function getMessageInstance(): MessageInstance {
  if (messageInstance) return messageInstance

  const container = document.createElement('div')
  container.setAttribute('class', 'message-container')
  document.body.appendChild(container)

  const vnode = createVNode(Message)
  render(vnode, container)

  const msg = vnode.component?.exposed as {
    show: (options: MessageOptions) => void
  }

  messageInstance = {
    success(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'success', content, ...options })
    },
    error(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'error', content, ...options })
    },
    warning(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'warning', content, ...options })
    },
    info(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'info', content, ...options })
    },
    destroy() {
      render(null, container)
      document.body.removeChild(container)
      messageInstance = null
    },
  }

  return messageInstance
}

function message(): MessageInstance {
  return getMessageInstance()
}

message.success = (content: string, options?: Partial<MessageOptions>) =>
  getMessageInstance().success(content, options)
message.error = (content: string, options?: Partial<MessageOptions>) =>
  getMessageInstance().error(content, options)
message.warning = (content: string, options?: Partial<MessageOptions>) =>
  getMessageInstance().warning(content, options)
message.info = (content: string, options?: Partial<MessageOptions>) =>
  getMessageInstance().info(content, options)
message.destroy = () => getMessageInstance().destroy()

export { message }
