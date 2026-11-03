package com.pios.ai;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SecretEncryptionService {
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public SecretEncryptionService(@Value("${app.encryption.key-base64}") String base64Key) {
        try {
            byte[] raw = Base64.getDecoder().decode(base64Key);
            if (raw.length != 32) {
                throw new IllegalArgumentException("PIOS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
            }
            this.key = new SecretKeySpec(raw, "AES");
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("Invalid PIOS_ENCRYPTION_KEY configuration.", ex);
        }
    }

    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            ByteBuffer packed = ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext);
            return "v1:" + Base64.getEncoder().encodeToString(packed.array());
        } catch (Exception ex) {
            throw new IllegalStateException("Could not encrypt provider credential.", ex);
        }
    }

    public String decrypt(String packedValue) {
        if (packedValue == null || packedValue.isBlank()) return null;
        if (!packedValue.startsWith("v1:")) throw new IllegalArgumentException("Unsupported encrypted credential format.");
        try {
            byte[] packed = Base64.getDecoder().decode(packedValue.substring(3));
            ByteBuffer buffer = ByteBuffer.wrap(packed);
            byte[] iv = new byte[IV_LENGTH];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not decrypt provider credential. Check that PIOS_ENCRYPTION_KEY has not changed.", ex);
        }
    }
}
