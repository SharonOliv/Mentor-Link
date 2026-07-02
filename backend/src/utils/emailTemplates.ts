const wrapper = (body: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 480px;">
    ${body}
    <p style="color:#666; font-size:13px;">Faculty Appointment System</p>
  </div>
`;

export const bookingRequestEmail = (mentorName: string, studentName: string, when: string) =>
  wrapper(`
    <h2>New appointment request</h2>
    <p>Dear ${mentorName},</p>
    <p>${studentName} has requested an appointment scheduled for <strong>${when}</strong>.</p>
    <p>Please log in to review and respond.</p>
  `);

export const bookingApprovedEmail = (studentName: string, mentorName: string, when: string) =>
  wrapper(`
    <h2>Appointment confirmed</h2>
    <p>Dear ${studentName},</p>
    <p>Your appointment with ${mentorName} on <strong>${when}</strong> has been approved.</p>
    <p>Please make sure to join on time.</p>
  `);

export const bookingRejectedEmail = (studentName: string, mentorName: string, when: string) =>
  wrapper(`
    <h2>Appointment request declined</h2>
    <p>Dear ${studentName},</p>
    <p>Your appointment request with ${mentorName} for <strong>${when}</strong> was declined. The slot is open again if you'd like to choose a different time.</p>
  `);

export const tempPasswordEmail = (name: string, email: string, tempPassword: string) =>
  wrapper(`
    <h2>Your account has been created</h2>
    <p>Dear ${name},</p>
    <p>An account has been created for you on the Faculty Appointment System.</p>
    <p>Email: <strong>${email}</strong><br/>Temporary password: <strong>${tempPassword}</strong></p>
    <p>You'll be asked to set a new password the first time you log in.</p>
  `);
