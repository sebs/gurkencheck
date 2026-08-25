Feature: A doc string next to a real violation

  Scenario: A step with a quoted document
    Given the message:
      """
      first paragraph


      second paragraph
      """


    Then it is accepted
