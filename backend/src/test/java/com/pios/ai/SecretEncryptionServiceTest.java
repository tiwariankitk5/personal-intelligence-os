package com.pios.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;
import java.util.Base64;

class SecretEncryptionServiceTest {
    private final SecretEncryptionService encryption = new SecretEncryptionService(
            Base64.getEncoder().encodeToString(new byte[32]));

    @Test
    void encryptsAndDecryptsProviderKey() {
        String plaintext = "pios-test-provider-secret";
        String encrypted = encryption.encrypt(plaintext);
        assertNotEquals(plaintext, encrypted);
        assertEquals(plaintext, encryption.decrypt(encrypted));
    }

    @Test
    void usesFreshIvForEachEncryption() {
        String first = encryption.encrypt("same-secret");
        String second = encryption.encrypt("same-secret");
        assertNotEquals(first, second);
        assertEquals("same-secret", encryption.decrypt(first));
        assertEquals("same-secret", encryption.decrypt(second));
    }

    @Test
    void rejectsTamperedCiphertext() {
        String encrypted = encryption.encrypt("provider-secret");
        char last = encrypted.charAt(encrypted.length() - 1);
        String tampered = encrypted.substring(0, encrypted.length() - 1) + (last == 'A' ? 'B' : 'A');
        assertThrows(IllegalStateException.class, () -> encryption.decrypt(tampered));
    }
}
