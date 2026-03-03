import { describe, it, expect } from 'vitest';
import { parseGroovyServerError, parseServerError } from './errorUtils';

const mockErrorFromCurrentFile = [
  'java.lang.RuntimeException: Error in Python interpreter:',
  "Type: <class 'NameError'>",
  "Value: name 'x' is not defined",
  'Line: 5',
  'Namespace: <module>',
  'File: <string>',
  'Traceback (most recent call last):',
  '  File "<string>", line 5, in <module>',
  '',
  '\tat org.jpy.PyLib.executeCode(Native Method)',
  '\tat org.jpy.PyObject.executeCode(PyObject.java:133)',
  '\tat io.deephaven.engine.util.PythonEvaluatorJpy.evalScript(PythonEvaluatorJpy.java:73)',
  '\tat io.deephaven.integrations.python.PythonDeephavenSession.lambda$evaluate$1(PythonDeephavenSession.java:229)',
  '\tblah',
  '\tbleh',
  '',
].join('\n');

const mockErrorFromAnotherFile = [
  'java.lang.RuntimeException: Error in Python interpreter:',
  "Type: <class 'Exception'>",
  'Value: Some error',
  'Line: 1',
  'Namespace: <module>',
  'File: /some/path/my_weather/error_test.py',
  'Traceback (most recent call last):',
  '  File "<string>", line 6, in <module>',
  '  File "/some/path/my_weather/__init__.py", line 3, in <module>',
  '  File "/some/path/my_weather/weather.py", line 9, in <module>',
  '  File "/some/path/my_weather/error_test.py", line 1, in <module>',
  '',
  '\tat org.jpy.PyLib.executeCode(Native Method)',
  '\tat org.jpy.PyObject.executeCode(PyObject.java:133)',
  '\tat io.deephaven.engine.util.PythonEvaluatorJpy.evalScript(PythonEvaluatorJpy.java:73)',
  '\tat io.deephaven.integrations.python.PythonDeephavenSession.lambda$evaluate$1(PythonDeephavenSession.java:229)',
  '\tblah',
  '\tbleh',
  '',
].join('\n');

const mockGroovyImportError =
  'RuntimeException: Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;';

describe('parseGroovyServerError', () => {
  it('should parse a Groovy import error', () => {
    const parsed = parseGroovyServerError(mockGroovyImportError);
    expect(parsed).toHaveLength(1);

    const [error] = parsed;
    expect(error).toEqual({
      type: 'RuntimeException',
      value:
        'Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;',
      importPath: 'package3.subpackage1.MultiClassTest',
    });
  });

  it('should return empty array for unrecognized error format', () => {
    const parsed = parseGroovyServerError('Some other error');
    expect(parsed).toHaveLength(0);
  });

  it('should return empty array for empty string', () => {
    const parsed = parseGroovyServerError('');
    expect(parsed).toHaveLength(0);
  });
});

describe('parseServerError', () => {
  it('should parse an error originating from the current file', () => {
    const parsed = parseServerError(mockErrorFromCurrentFile);
    expect(parsed).toHaveLength(1);

    const [error] = parsed;
    const { traceback, ...rest } = error ?? {};

    expect(rest).toMatchSnapshot('error <string>');
    expect(traceback).toMatchSnapshot('traceback');
  });

  it('should parse an error originating from another file', () => {
    const parsed = parseServerError(mockErrorFromAnotherFile);
    expect(parsed).toHaveLength(2);

    const [errorA, errorB] = parsed;
    const { traceback: originalTraceback, ...restA } = errorA ?? {};
    const { traceback: adjustedTraceback, ...restB } = errorB ?? {};

    expect(restA).toMatchSnapshot('error path');
    expect(restB).toMatchSnapshot('error <string>');

    expect(originalTraceback).toEqual(adjustedTraceback);
    expect(originalTraceback).toMatchSnapshot('traceback');
  });
});
