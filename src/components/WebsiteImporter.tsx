import { useState } from 'react';

function WebsiteImporter() {
    const [url, setUrl] = useState('');

    function handleImport() {
        console.log(`Importing website from URL: ${url}`);
    }

    return (
        <>
            <h1>Website Importer</h1>
            <input id="websiteUrl" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter website URL" />
            <button type="button" onClick={handleImport}>Import</button>
        </>
    );
}

export default WebsiteImporter;