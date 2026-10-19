/**
 * How a failed send should be handled:
 *  - rejected: the address itself was refused. Fail immediately, never retry.
 *  - retry:    network trouble or rate limit. Try again later (max 3 attempts).
 *  - config:   our own setup is wrong (bad key, unverified domain). Stop sending
 *              and put the person back in the queue untouched.
 */
export type SendErrorKind = 'rejected' | 'retry' | 'config';

export class SendError extends Error {
  constructor(public kind: SendErrorKind, message: string) {
    super(message);
  }
}
