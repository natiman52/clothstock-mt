import hashlib
import hmac
import json


SIGNATURE_ALGORITHM = 'HMAC-SHA256'


def canonical_json(document):
    unsigned = {key: value for key, value in document.items() if key != 'signature'}
    return json.dumps(
        unsigned,
        sort_keys=True,
        separators=(',', ':'),
        ensure_ascii=False,
    ).encode('utf-8')


def verify_document(document, secret):
    signature = document.get('signature')
    if not isinstance(signature, dict) or signature.get('algorithm') != SIGNATURE_ALGORITHM:
        return False
    expected = hmac.new(
        secret.encode('utf-8'),
        canonical_json(document),
        hashlib.sha256,
    ).hexdigest()
    supplied = signature.get('value')
    return isinstance(supplied, str) and hmac.compare_digest(expected, supplied)
