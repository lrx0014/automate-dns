export const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
} as const;

export function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: JSON_HEADERS,
	});
}

export function jsonError(
	message: string,
	status = 400,
	extra?: Record<string, unknown>,
) {
	return jsonResponse(
		{
			error: message,
			...(extra ?? {}),
		},
		status,
	);
}
