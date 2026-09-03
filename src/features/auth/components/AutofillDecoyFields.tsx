export function AutofillDecoyFields() {
  return (
    <>
      <input type="text" name="fakeusernameremembered" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
      <input type="password" name="fakepasswordremembered" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
    </>
  );
}
