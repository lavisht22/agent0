import * as openpgp from "openpgp";

// Cache the decrypted private key — same key/passphrase every time,
// no reason to re-parse and decrypt it on every request
let cachedPrivateKey = null;

const getPrivateKey = async () => {
	if (!cachedPrivateKey) {
		cachedPrivateKey = await openpgp.decryptKey({
			privateKey: await openpgp.readPrivateKey({
				armoredKey: process.env.PGP_PRIVATE_KEY || "",
			}),
			passphrase: process.env.PGP_PRIVATE_KEY_PASSPHRASE || "",
		});
	}
	return cachedPrivateKey;
};

export const decryptMessage = async (messageStr) => {
	const privateKey = await getPrivateKey();

	const message = await openpgp.readMessage({
		armoredMessage: messageStr,
	});

	const { data: decrypted } = await openpgp.decrypt({
		message,
		decryptionKeys: privateKey,
	});

	return decrypted;
};
