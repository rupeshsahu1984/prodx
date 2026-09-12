import { assertDifferentPerson, assertPermission, type Permission } from '../auth/permissions'

/**
 * The document state machine shared by every module (CLAUDE.md: engines, not
 * 151 CRUD modules). The prototype's `behavior()` already grouped all 151
 * modules into 13 workflows; this is what those definitions plug into.
 */

export interface Transition<S extends string> {
  from: S
  to: S
  /** The verb a user sees and the API accepts: "submit", "approve", "post". */
  action: string
  permission: Permission
  /** Approval steps: the actor must differ from whoever submitted (gap 10). */
  requiresDifferentPerson?: boolean
  /** Terminal transitions produce a state nothing may leave. */
  terminal?: boolean
}

export interface WorkflowDefinition<S extends string> {
  initial: S
  transitions: ReadonlyArray<Transition<S>>
}

export interface TransitionContext {
  permissions: readonly Permission[]
  actorId: string
  /** Who moved the document into its current state. Required for maker-checker. */
  submittedBy?: string | undefined
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION'
  constructor(from: string, action: string) {
    super(`Cannot "${action}" a document in state ${from}`)
  }
}

export class Workflow<S extends string> {
  constructor(private readonly definition: WorkflowDefinition<S>) {}

  get initial(): S {
    return this.definition.initial
  }

  /** Transitions available from a state, before permissions are considered. */
  availableFrom(from: S): ReadonlyArray<Transition<S>> {
    return this.definition.transitions.filter((t) => t.from === from)
  }

  /** What this actor may actually do — the correct source for UI affordances. */
  allowedFor(from: S, context: TransitionContext): ReadonlyArray<Transition<S>> {
    return this.availableFrom(from).filter((t) => {
      if (!context.permissions.some((p) => p === '*' || p === t.permission)) return false
      if (t.requiresDifferentPerson === true && context.submittedBy === context.actorId) return false
      return true
    })
  }

  /**
   * Validates and returns the next state. Throws rather than returning a result
   * object: an unhandled invalid transition must abort the request, never fall
   * through to a posting.
   */
  apply(from: S, action: string, context: TransitionContext): S {
    const transition = this.definition.transitions.find((t) => t.from === from && t.action === action)
    if (transition === undefined) throw new InvalidTransitionError(from, action)

    assertPermission(context.permissions, transition.permission)

    if (transition.requiresDifferentPerson === true) {
      if (context.submittedBy === undefined) {
        throw new Error(
          `Transition "${action}" requires maker-checker but no submitter was supplied.`,
        )
      }
      assertDifferentPerson(context.submittedBy, context.actorId)
    }

    return transition.to
  }

  isTerminal(state: S): boolean {
    return this.availableFrom(state).length === 0
  }
}
