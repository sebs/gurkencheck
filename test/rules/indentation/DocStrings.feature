Feature: Doc string indentation

  Scenario: Quotes indented one level past the step
    When I use this docstring:
      """
      This is a docstring
      """
    Then the rule should pass

  Scenario: Quotes level with the step
    When I use this docstring:
    """
    This is a docstring
    """
    Then the rule should fail

  Scenario: Backtick quotes level with the step
    When I use this payload:
    ```
    {}
    ```
    Then the rule should fail
