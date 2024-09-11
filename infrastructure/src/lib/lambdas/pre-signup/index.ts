import { Context, PreSignUpTriggerEvent } from 'aws-lambda';

export async function handler(
  event : PreSignUpTriggerEvent,
  _context: Context,
  callback: Function
) {
  let {
    request: {
      userAttributes: { name }
    }
  } = event;
  if (name) {
    callback(null, event);
  } else {
    callback(new Error('A name is required for sign-up.'), event);
  }
  // Only allow users with the a name to signup.
  
}
