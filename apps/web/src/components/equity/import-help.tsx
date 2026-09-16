const importEmail =
  "mailto:hello@capyinc.com?subject=Full%20Pulley%20import&body=Hi%20Capy%2C%20I%27d%20like%20help%20bringing%20my%20remaining%20records%20and%20documents%20over%20from%20Pulley.";

export function ImportHelp({ detailed = false }: { detailed?: boolean }) {
  if (detailed)
    return (
      <aside className="eq-import-help">
        <h3>Bring the rest of your records with you</h3>
        <p>
          Pulley’s Excel export includes your cap table, but may leave out documents, approvals,
          valuations and other records. Our team can arrange a fuller, manual server-to-server
          import from Pulley.
        </p>
        <a href={importEmail}>Email hello@capyinc.com to arrange your import →</a>
      </aside>
    );
  return (
    <span className="eq-empty-help">
      These records may not be included in your Pulley export.
      <br />
      <a href={importEmail}>Request a full import</a> and our team will help bring them over.
    </span>
  );
}
