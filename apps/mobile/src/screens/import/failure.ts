/** The message for a request of the course companion that did not complete, by its error code. */
export function importFailureKey(code: string) {
  switch (code) {
    case 'consent_required':
      return 'import.consent';
    case 'too_many':
      return 'import.tooMany';
    case 'import_limit':
      return 'import.limit';
    case 'not_in_language':
      return 'import.notInLanguage';
    case 'no_text':
      return 'import.noText';
    case 'not_text':
      return 'import.notText';
    case 'blocked':
      return 'import.blocked';
    case 'unreachable':
      return 'import.unreachable';
    case 'invalid_photo':
      return 'import.invalidPhoto';
    case 'invalid_value':
      return 'import.invalidValue';
    case 'upload_failed':
      return 'import.uploadFailed';
    case 'network':
      return 'errors.network';
    default:
      return 'import.failed';
  }
}
